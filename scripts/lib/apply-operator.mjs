/**
 * Apply Operator — reusable Greenhouse application pipeline.
 *
 * Stages:
 *   1. fetch   — GET the embed page HTML
 *   2. parse   — extract form fields, detect captcha, extract tokens
 *   3. resolve — fill every field using field-resolver (heuristic → LLM)
 *   4. build   — assemble the POST payload (URLSearchParams or multipart)
 *   5. submit  — fire the HTTP POST  (caller opts in; default is stop-before-submit)
 *
 * Usage:
 *   import { prepare, submit } from '../lib/apply-operator.mjs';
 *   const app = await prepare(profile, { board: 'williamblair', job_id: '123' });
 *   // app.ready  → true if no captcha, all required fields resolved
 *   // app.captcha.type → 'none' | 'v2' | 'v3' | 'enterprise' | …
 *   // app.fields → [{ label, canonical, value, source, fieldType }]
 *   // app.missing → fields that couldn't be resolved
 *   if (app.ready) await submit(app);
 */

import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { resolveField } from "./field-resolver.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Stage 1: Fetch ──

export async function fetchEmbed(board, jobId) {
  // New Greenhouse redirects boards.greenhouse.io → job-boards.greenhouse.io
  // Use the new domain directly to avoid redirect issues
  const embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${jobId}`;
  const res = await fetch(embedUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Embed fetch failed: HTTP ${res.status}`);
  return { html: await res.text(), embedUrl: res.url || embedUrl };
}

// ── Stage 2: Parse ──

export function detectCaptcha(html) {
  const lower = html.toLowerCase();

  if (lower.includes("hcaptcha") || lower.includes("h-captcha")) {
    const sk = html.match(/data-sitekey="([^"]+)"/);
    return { type: "hcaptcha", sitekey: sk?.[1] || null };
  }

  const hasRecaptcha = lower.includes("recaptcha") || lower.includes("grecaptcha");
  if (!hasRecaptcha) return { type: "none", sitekey: null };

  if (lower.includes("recaptcha/enterprise") || lower.includes("grecaptcha.enterprise")) {
    const sk = html.match(/enterprise\.js\?render=([^"'&\s]+)/) ||
               html.match(/data-sitekey="([^"]+)"/);
    return { type: "enterprise", sitekey: sk?.[1] || null };
  }

  const v3Match = html.match(/recaptcha\/api\.js\?render=([^"'&\s]+)/);
  if (v3Match && v3Match[1] !== "explicit") {
    return { type: "v3", sitekey: v3Match[1] };
  }
  if (lower.includes("grecaptcha.execute(")) {
    const sk = html.match(/data-sitekey="([^"]+)"/);
    return { type: "v3", sitekey: sk?.[1] || null };
  }

  const v2Match = html.match(/class="[^"]*g-recaptcha[^"]*"[^>]*data-sitekey="([^"]+)"/) ||
                  html.match(/data-sitekey="([^"]+)"[^>]*class="[^"]*g-recaptcha/);
  if (v2Match) return { type: "v2", sitekey: v2Match[1] };

  return { type: "unknown", sitekey: null };
}

export function parseFormTokens(html) {
  const fp = html.match(/name="fingerprint"[^>]*value="([^"]+)"/);
  const rd = html.match(/name="render_date"[^>]*value="([^"]+)"/);
  const plt = html.match(/name="page_load_time"[^>]*value="([^"]+)"/);
  if (!fp || !rd || !plt) return null;
  return { fingerprint: fp[1], renderDate: rd[1], pageLoadTime: plt[1] };
}

export function parseFormFields(html) {
  const fields = [];
  const qidPattern = /job_application\[answers_attributes\]\[(\d+)\]\[question_id\]"[^>]*value="(\d+)"/g;
  let match;
  while ((match = qidPattern.exec(html)) !== null) {
    const idx = parseInt(match[1], 10);
    const qid = match[2];

    // Detect field type
    const hasBool = html.includes(`answers_attributes][${idx}][boolean_value]`);
    const hasTextarea = html.includes(`answers_attributes][${idx}][text_value]`) &&
                        new RegExp(`answers_attributes\\]\\[${idx}\\]\\[text_value\\][\\s\\S]*?<textarea`, "i").test(html);

    // Extract label
    const labelPattern = new RegExp(
      `answers_attributes\\]\\[${idx}\\][\\s\\S]*?<label[^>]*>([^<]+)<`, "i"
    );
    const labelMatch = html.match(labelPattern);
    const label = labelMatch ? labelMatch[1].trim() : `question_${qid}`;

    // Extract select/combobox options
    const selectPattern = new RegExp(
      `answers_attributes\\]\\[${idx}\\][\\s\\S]*?<select[\\s\\S]*?</select>`, "i"
    );
    const selectMatch = html.match(selectPattern);
    let options = null;
    if (selectMatch) {
      options = [...selectMatch[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)]
        .map(m => ({ value: m[1], text: m[2].trim() }))
        .filter(o => o.value);
    }

    let fieldType = "text";
    if (hasBool) fieldType = "boolean";
    else if (options) fieldType = "combobox";
    else if (hasTextarea) fieldType = "textarea";

    // Detect if required
    const requiredPattern = new RegExp(
      `answers_attributes\\]\\[${idx}\\][\\s\\S]{0,300}?(required|\\*)`, "i"
    );
    const required = requiredPattern.test(html);

    fields.push({ index: idx, questionId: qid, label, fieldType, options, required });
  }
  return fields;
}

// ── Stage 3: Resolve ──

export async function resolveFields(fields, profile, opts = {}) {
  const resolved = [];
  for (const field of fields) {
    if (field.fieldType === "boolean") {
      // Boolean fields use heuristic mapping
      const label = field.label.toLowerCase();
      let value = "1"; // default yes
      if (label.includes("previously applied") || label.includes("have you ever worked")) value = "0";
      if ((label.includes("authorized") || label.includes("legally authorized")) && profile.authorizedToWork) value = "1";
      if ((label.includes("authorized") || label.includes("legally authorized")) && !profile.authorizedToWork) value = "0";
      if (label.includes("sponsorship") || label.includes("require sponsor") || label.includes("visa")) {
        value = profile.requiresSponsorship ? "1" : "0";
      }
      if (label.includes("military") || label.includes("veteran")) value = "0";
      if (label.includes("privacy") || label.includes("consent")) value = "1";
      if (label.includes("18 years") || label.includes("of age")) value = "1";
      resolved.push({ ...field, value, source: "heuristic" });
    } else {
      // Use field-resolver (Layer 1 heuristic → Layer 2 profile → Layer 3 LLM)
      const optionTexts = field.options?.map(o => o.text) || null;
      const { value, source, canonical } = await resolveField(
        field.label, field.fieldType, optionTexts, profile, { useLLM: opts.useLLM ?? false }
      );
      resolved.push({ ...field, value: value || "", source, canonical });
    }
  }
  return resolved;
}

// ── Stage 4: Build payload ──

export function buildPayload(profile, tokens, resolvedFields) {
  const params = new URLSearchParams();
  params.append("utf8", "\u2713");
  params.append("fingerprint", tokens.fingerprint);
  params.append("render_date", tokens.renderDate);
  params.append("page_load_time", tokens.pageLoadTime);
  params.append("from_embed", "true");
  params.append("security_code", "");

  // Core candidate fields
  params.append("job_application[first_name]", profile.firstName);
  params.append("job_application[last_name]", profile.lastName);
  params.append("job_application[email]", profile.email);
  params.append("job_application[phone]", profile.phone || profile.phoneRaw);
  params.append("job_application[resume_text]", profile.resumeText || "");
  params.append("job_application[location]", profile.location);

  // Resolved question fields
  for (const f of resolvedFields) {
    const prefix = `job_application[answers_attributes][${f.index}]`;
    params.append(`${prefix}[question_id]`, f.questionId);
    params.append(`${prefix}[priority]`, String(f.index));

    if (f.fieldType === "boolean") {
      params.append(`${prefix}[boolean_value]`, f.value);
    } else {
      params.append(`${prefix}[text_value]`, f.value);
    }
  }

  return params;
}

// ── React (Remix) Form: Fetch + Parse from __remixContext ──

export async function fetchReactPage(board, jobId) {
  const pageUrl = `https://job-boards.greenhouse.io/${board}/jobs/${jobId}`;
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`React page fetch failed: HTTP ${res.status}`);
  return { html: await res.text(), pageUrl };
}

export function parseRemixContext(html) {
  const match = html.match(/window\.__remixContext\s*=\s*(\{.*?\});/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractReactFormData(ctx) {
  // Find the route loader data (key varies, but contains jobPost)
  const loaderData = ctx?.state?.loaderData || {};
  for (const val of Object.values(loaderData)) {
    if (val && typeof val === "object" && val.jobPost) {
      return {
        jobPostId: val.jobPostId,
        urlToken: val.urlToken,
        submitPath: val.submitPath,
        confirmationPath: val.confirmationPath,
        fingerprint: val.jobPost.fingerprint,
        questions: val.jobPost.questions || [],
        educationConfig: val.jobPost.education_config,
        enableEeoc: val.jobPost.enable_eeoc,
        eeocSections: val.jobPost.eeoc_sections || [],
        title: val.jobPost.title,
      };
    }
  }
  return null;
}

/**
 * Convert React question schema into the same { index, label, fieldType, ... }
 * format that resolveFields() expects.
 */
export function normalizeReactQuestions(questions) {
  return questions.map((q, idx) => {
    const field = q.fields[0]; // primary field
    let fieldType = "text";
    let options = null;

    if (field.type === "input_file") fieldType = "file";
    else if (field.type === "textarea") fieldType = "textarea";
    else if (field.type === "multi_value_single_select") {
      fieldType = "combobox";
      options = (field.values || []).map(v => ({ value: String(v.value), text: v.label }));
    } else if (field.type === "multi_value_multi_select") {
      fieldType = "multiselect";
      options = (field.values || []).map(v => ({ value: String(v.value), text: v.label }));
    }

    return {
      index: idx,
      questionId: null, // React forms use field.name instead
      fieldName: field.name,
      label: q.label,
      fieldType,
      options,
      required: q.required,
      allFields: q.fields, // keep all fields (e.g. resume has both file + textarea)
    };
  });
}

/**
 * Resolve fields for React forms — uses field-resolver for text/combobox,
 * special handling for multiselect.
 */
export async function resolveReactFields(fields, profile, opts = {}) {
  const resolved = [];
  for (const field of fields) {
    if (field.fieldType === "file") {
      // File upload — value is the resume path, handled separately at submit time
      resolved.push({ ...field, value: profile.resumePath || "", source: "profile" });
      continue;
    }

    if (field.fieldType === "multiselect") {
      // Multi-select: match profile values against available options
      const { value, source, canonical } = await resolveField(
        field.label, "text", field.options?.map(o => o.text), profile, { useLLM: opts.useLLM ?? false }
      );
      // value might be a single string — try to match multiple options
      const selected = [];
      if (value) {
        const parts = value.split(/[,;]+/).map(s => s.trim().toLowerCase());
        for (const opt of (field.options || [])) {
          if (parts.some(p => opt.text.toLowerCase().includes(p) || p.includes(opt.text.toLowerCase()))) {
            selected.push(opt);
          }
        }
      }
      resolved.push({ ...field, value: selected.map(s => s.value).join(","), selectedLabels: selected.map(s => s.text), source: source || "heuristic", canonical });
      continue;
    }

    if (field.fieldType === "combobox") {
      const optTexts = field.options?.map(o => o.text) || [];
      const { value, source, canonical } = await resolveField(
        field.label, "combobox", optTexts, profile, { useLLM: opts.useLLM ?? false }
      );
      // Map resolved text back to option value
      let optionValue = value;
      if (value && field.options) {
        const match = field.options.find(o =>
          o.text.toLowerCase() === (value || "").toLowerCase() ||
          o.text.toLowerCase().includes((value || "").toLowerCase())
        );
        if (match) optionValue = match.value;
      }
      resolved.push({ ...field, value: optionValue || "", source, canonical });
      continue;
    }

    // text / textarea
    const optTexts = field.options?.map(o => o.text) || null;
    const { value, source, canonical } = await resolveField(
      field.label, field.fieldType, optTexts, profile, { useLLM: opts.useLLM ?? false }
    );

    // Core fields that map directly from profile
    let finalValue = value || "";
    if (!finalValue) {
      const name = field.fieldName;
      if (name === "first_name") finalValue = profile.firstName;
      else if (name === "last_name") finalValue = profile.lastName;
      else if (name === "email") finalValue = profile.email;
      else if (name === "phone") finalValue = profile.phone || profile.phoneRaw;
      else if (name === "resume_text") finalValue = profile.resumeText || "";
    }

    resolved.push({ ...field, value: finalValue, source: finalValue ? (source || "profile") : "none", canonical });
  }
  return resolved;
}

/**
 * Build multipart/form-data payload for React Greenhouse forms.
 */
export function buildReactPayload(profile, formData, resolvedFields) {
  const form = new FormData();
  const ja = (key) => `job_application[${key}]`;

  // Anti-fraud
  form.append("fingerprint", formData.fingerprint || "");

  // Core candidate fields — must be under job_application[] namespace
  form.append(ja("first_name"), profile.firstName);
  form.append(ja("last_name"), profile.lastName);
  form.append(ja("email"), profile.email);
  form.append(ja("phone"), profile.phone || profile.phoneRaw);
  form.append(ja("location"), profile.location);

  // Education (if required)
  if (formData.educationConfig) {
    const edu = (key) => `job_application[educations_attributes][0][${key}]`;
    form.append(edu("school_name_id"), "");
    form.append(edu("school_name"), profile.school);
    form.append(edu("degree_id"), "");
    form.append(edu("degree"), profile.degree);
    form.append(edu("discipline_id"), "");
    form.append(edu("discipline"), profile.discipline);
    form.append(edu("start_month"), String(profile.startMonthEdu || 9));
    form.append(edu("start_year"), String(profile.startYearEdu || 2023));
    form.append(edu("end_month"), String(profile.graduationMonthNum || 5));
    form.append(edu("end_year"), String(profile.graduationYear));
  }

  // Resume file attachment
  const resumeField = resolvedFields.find(f => f.fieldType === "file");
  if (resumeField && profile.resumePath && existsSync(profile.resumePath)) {
    const pdfBytes = readFileSync(profile.resumePath);
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    form.append(ja("resume"), pdfBlob, basename(profile.resumePath));
  }
  form.append(ja("resume_text"), profile.resumeText || "");

  // Resolved question fields — custom questions go under answers_attributes
  let answerIdx = 0;
  for (const f of resolvedFields) {
    if (f.fieldType === "file") continue; // already handled above
    // Core fields (first_name, last_name, etc.) are already appended above
    if (["first_name", "last_name", "email", "phone", "resume_text", "candidate_location"].includes(f.fieldName)) continue;

    const prefix = `job_application[answers_attributes][${answerIdx}]`;
    // The fieldName for custom questions looks like "question_12345" — extract the ID
    const qidMatch = f.fieldName.replace(/\[\]$/, "").match(/question_(\d+)/);

    if (qidMatch) {
      form.append(`${prefix}[question_id]`, qidMatch[1]);
      form.append(`${prefix}[priority]`, String(answerIdx));

      if (f.fieldType === "combobox") {
        form.append(`${prefix}[text_value]`, f.value || "");
      } else if (f.fieldType === "multiselect" && f.value) {
        for (const v of f.value.split(",")) {
          form.append(`${prefix}[text_value][]`, v);
        }
      } else {
        form.append(`${prefix}[text_value]`, f.value || "");
      }
      answerIdx++;
    }
  }

  return form;
}

// ── Stage 5: Submit ──

export async function submitPayload(board, jobId, embedUrl, payload) {
  const submitUrl = `https://boards.greenhouse.io/embed/${board}/jobs/${jobId}`;
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Origin: "https://boards.greenhouse.io",
      Referer: embedUrl,
    },
    body: payload.toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });

  const status = res.status;
  const location = res.headers.get("location") || "";

  if (status === 302 || status === 301) {
    const isSuccess = location.includes("confirmation") || location.includes("thank");
    return { success: isSuccess, message: isSuccess ? `Redirect: ${location}` : `Redirected: ${location}` };
  }

  const text = await res.text();
  const lower = text.toLowerCase();
  if (lower.includes("already") && lower.includes("applied")) return { success: false, error: "Already applied" };
  if ((lower.includes("thank you") || lower.includes("submitted")) && !lower.includes("error")) {
    return { success: true, message: "Application submitted" };
  }
  return { success: false, error: `HTTP ${status} (${lower.includes("error") ? "form errors" : "unclear"})` };
}

export async function submitReactPayload(submitPath, payload) {
  // React Greenhouse forms submit as JSON: { job_application: {...}, fingerprint: "..." }
  // payload can be FormData (legacy) or a JSON-ready object
  let body;
  let contentType;

  if (payload instanceof FormData) {
    // Convert FormData to JSON structure the React form expects
    const jsonBody = { job_application: {} };
    for (const [k, v] of payload.entries()) {
      if (k === "fingerprint") {
        jsonBody.fingerprint = v;
      } else if (k.startsWith("job_application[")) {
        // Parse nested keys: job_application[first_name] → { first_name: v }
        const inner = k.replace("job_application[", "").replace(/\]$/, "");
        if (inner.includes("[")) {
          // Nested: answers_attributes[0][question_id] or educations_attributes[0][school_name]
          const parts = inner.split(/\]\[|\[/).map(p => p.replace("]", ""));
          let obj = jsonBody.job_application;
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (!obj[key]) obj[key] = /^\d+$/.test(parts[i + 1]) || /^\d+$/.test(key) ? {} : {};
            obj = obj[key];
          }
          const lastKey = parts[parts.length - 1];
          // Handle array fields (text_value[] for multiselect)
          if (lastKey.endsWith("[]")) {
            const arrKey = lastKey.slice(0, -2);
            if (!obj[arrKey]) obj[arrKey] = [];
            if (v) obj[arrKey].push(v);
          } else if (v instanceof Blob) {
            // Skip file blobs in JSON mode — resume uploaded separately or as text
          } else {
            obj[lastKey] = v;
          }
        } else if (v instanceof Blob) {
          // Skip blobs
        } else {
          jsonBody.job_application[inner] = v;
        }
      }
    }
    // Include empty recaptcha token so Greenhouse returns a proper 428 instead of 400
    if (!jsonBody["g-recaptcha-enterprise-token"]) {
      jsonBody["g-recaptcha-enterprise-token"] = "";
    }
    body = JSON.stringify(jsonBody);
    contentType = "application/json";
  } else {
    body = JSON.stringify(payload);
    contentType = "application/json";
  }

  const res = await fetch(submitPath, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "User-Agent": UA,
      Origin: "https://job-boards.greenhouse.io",
      Referer: "https://job-boards.greenhouse.io/",
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });

  const status = res.status;
  const location = res.headers.get("location") || "";

  if (status === 302 || status === 301) {
    const isSuccess = location.includes("confirmation") || location.includes("thank");
    return { success: isSuccess, message: isSuccess ? `Redirect → ${location}` : `Redirect → ${location}` };
  }

  const text = await res.text();
  const lower = text.toLowerCase();
  if (lower.includes("already") && lower.includes("applied")) return { success: false, error: "Already applied" };
  if (lower.includes("thank") || lower.includes("submitted")) return { success: true, message: "Application submitted" };
  if (lower.includes("recaptcha") || lower.includes("captcha")) return { success: false, error: "captcha:enterprise (blocked at submit)" };
  // Parse JSON error responses from Greenhouse
  try {
    const json = JSON.parse(text);
    if (json.code === "captcha-failed") {
      return { success: false, error: "captcha:enterprise — valid reCAPTCHA Enterprise token required. Open form in browser to solve manually." };
    }
    return { success: false, error: `HTTP ${status}: ${json.message || json.code || text.slice(0, 100)}` };
  } catch {}
  console.error(`  [submitReact] HTTP ${status} body:`, text.slice(0, 300));
  return { success: false, error: `HTTP ${status}` };
}

// ── Orchestrator: prepare() ──

/**
 * Run stages 1-4 for a single job. Returns everything needed to submit or queue.
 *
 * @param {object} profile - Candidate profile (from candidate-profile-aastha.mjs)
 * @param {{ board: string, job_id: string, title?: string }} job
 * @param {{ useLLM?: boolean }} opts
 * @returns {Promise<PreparedApplication>}
 */
export async function prepare(profile, job, opts = {}) {
  const result = {
    job,
    embedUrl: `https://boards.greenhouse.io/embed/job_app?for=${job.board}&token=${job.job_id}`,
    formType: null,  // "legacy" or "react"
    stage: null,     // last completed stage
    captcha: null,
    tokens: null,
    fields: [],
    resolved: [],
    missing: [],
    payload: null,
    reactFormData: null,
    submitPath: null,
    ready: false,
    error: null,
  };

  try {
    // Stage 1: Fetch embed page
    const { html, embedUrl } = await fetchEmbed(job.board, job.job_id);
    result.embedUrl = embedUrl;
    result.stage = "fetch";

    // Stage 2: Parse — detect form type
    result.captcha = detectCaptcha(html);
    result.tokens = parseFormTokens(html);
    result.fields = parseFormFields(html);
    result.stage = "parse";

    // Try legacy form first
    if (result.tokens && result.fields.length > 0) {
      // ── Legacy embed form path ──
      result.formType = "legacy";

      result.resolved = await resolveFields(result.fields, profile, opts);
      result.missing = result.resolved.filter(f => f.required && !f.value);
      result.stage = "resolve";

      result.payload = buildPayload(profile, result.tokens, result.resolved);
      result.stage = "build";

      result.ready = result.captcha.type === "none" && result.missing.length === 0;

    } else {
      // ── React (Remix) form path ──
      // The embed page itself (now on job-boards.greenhouse.io) contains __remixContext
      result.formType = "react";

      const ctx = parseRemixContext(html);
      if (!ctx) {
        result.error = "no_remix_context";
        return result;
      }
      const formData = extractReactFormData(ctx);
      if (!formData) {
        result.error = "no_form_data";
        return result;
      }
      result.reactFormData = formData;
      result.submitPath = formData.submitPath;
      result.captcha = detectCaptcha(html); // re-detect on full page
      result.stage = "parse_react";

      // Normalize questions + resolve
      result.fields = normalizeReactQuestions(formData.questions);
      result.resolved = await resolveReactFields(result.fields, profile, opts);
      result.missing = result.resolved.filter(f => f.required && !f.value && f.fieldType !== "file");
      result.stage = "resolve";

      // Build multipart payload
      result.payload = buildReactPayload(profile, formData, result.resolved);
      result.stage = "build";

      // Payload is fully built — captcha is the only blocker
      result.ready = result.captcha.type === "none" && result.missing.length === 0;
    }

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Submit a prepared application (stage 5).
 * Only call this on apps where app.ready === true.
 */
export async function submit(app) {
  if (!app.payload) throw new Error("No payload — run prepare() first");
  return submitPayload(app.job.board, app.job.job_id, app.embedUrl, app.payload);
}

/**
 * Generate a bookmarklet JS string for browser autofill.
 * Works on the direct embed URL for any candidate profile.
 */
export function generateAutofillScript(profile) {
  return `(function(){
  function s(id,v){var e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}}
  s('first_name','${profile.firstName}');
  s('last_name','${profile.lastName}');
  s('email','${profile.email}');
  s('phone','${profile.phone || profile.phoneRaw}');
  s('location','${profile.location}');
  var inputs=document.querySelectorAll('input[type=text],input[type=url],input[type=email],input[type=tel],textarea,select');
  inputs.forEach(function(el){
    var n=(el.name||'').toLowerCase();
    var lbl='';
    var labelEl=el.closest('.field')?.querySelector('label')||el.closest('div')?.querySelector('label');
    if(labelEl)lbl=labelEl.textContent.toLowerCase();
    var ctx=n+' '+lbl;
    if(!el.value){
      if(ctx.match(/linkedin/))el.value='${profile.linkedIn}';
      else if(ctx.match(/salary|compensation/))el.value='${profile.salaryExpectation || "Open to discussion"}';
      else if(ctx.match(/how did you hear|referral|source/))el.value='${profile.howDidYouHear || "Company website"}';
      else if(ctx.match(/year|experience/))el.value='${profile.yearsExperience || "3"}';
      else if(ctx.match(/current.*(title|role|position)/))el.value='${profile.jobTitle}';
      else if(ctx.match(/employer|company/))el.value='${profile.employer}';
      else if(ctx.match(/website|portfolio|github/))el.value='${profile.linkedIn}';
      else if(ctx.match(/sponsor|visa|immigration/))el.value='${profile.requiresSponsorship ? "Yes" : "No"}';
      else if(ctx.match(/relocat/))el.value='${profile.relocateDetails || "Open to relocation"}';
      else if(ctx.match(/start.?date|available|notice/))el.value='${profile.startDate || "Immediately"}';
      else if(ctx.match(/location|city|where/))el.value='${profile.location}';
      else if(ctx.match(/full.?name|legal.?name/))el.value='${profile.fullName}';
      else if(ctx.match(/school|university|college/))el.value='${profile.school}';
      else if(ctx.match(/degree/))el.value='${profile.degree}';
      else if(ctx.match(/gpa/))el.value='${profile.gpa}';
      else if(ctx.match(/graduat/))el.value='${profile.graduationMonth} ${profile.graduationYear}';
      else if(ctx.match(/program|language|skill/))el.value='${profile.programmingLanguages || "Python, R, SQL"}';
      if(el.value)el.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  var ct=0;inputs.forEach(function(e){if(e.value)ct++;});
  alert('Auto-filled '+ct+' fields. Upload resume & solve captcha.');
})()`;
}
