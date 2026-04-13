/**
 * Greenhouse job application form driver.
 *
 * Handles all Puppeteer interactions with Greenhouse job application forms:
 * - Form detection (React vs old style)
 * - Combobox filling with fuzzy matching + synonym expansion
 * - Question scanning and answering via field resolver
 * - EEO/demographic field detection and filling
 * - Resume upload, education, reCAPTCHA, submission
 * - Security code handling
 *
 * All candidate-specific data comes from the profile parameter — no hardcoded values.
 */

import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
import { resolveField, getSynonyms } from "./field-resolver.mjs";

// ── Browser Helpers ──

export function findChromePath() {
  const paths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  for (const p of paths) { if (existsSync(p)) return p; }
  throw new Error("Chrome not found. Set CHROME_PATH env var.");
}

/**
 * Fill a React Select combobox with fuzzy matching.
 *
 * Opens the dropdown, enumerates options, fuzzy-matches against candidate values
 * (with synonym expansion). Falls back to typing if needed.
 */
export async function fillCombobox(page, selector, value) {
  const el = await page.$(selector);
  if (!el) return false;
  const DEBUG_CBX = !!process.env.DEBUG_COMBOBOX;
  const cbxLog = (m) => { if (DEBUG_CBX) console.log(`    [cbx:${selector.substring(0,30)}] ${m}`); };

  // Build candidate list — expand using synonym table
  const candidates = getSynonyms(value);
  const v = value.toLowerCase();
  if (v === "consent") candidates.push("Consent", "I consent", "Yes");
  const months = { january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12" };
  if (months[v]) candidates.push(value, v.substring(0,3).charAt(0).toUpperCase() + v.substring(1,3), months[v]);
  if (v.startsWith("3.")) candidates.push("3.4 or higher", "3.5-3.9", "3.5-4.0", "3.0-3.9", value);

  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await new Promise(r => setTimeout(r, 100));
  await el.focus();
  await new Promise(r => setTimeout(r, 150));

  const verifyOpen = async () => await page.evaluate((sel) => {
    const inp = document.querySelector(sel);
    if (!inp) return false;
    const lb = document.getElementById("react-select-" + inp.id + "-listbox");
    if (!lb) return false;
    return !!lb.querySelector("[role='option'], .select__option");
  }, selector);

  await page.keyboard.press("ArrowDown");
  await new Promise(r => setTimeout(r, 400));
  cbxLog(`after ArrowDown: open=${await verifyOpen()}`);

  if (!(await verifyOpen())) {
    await el.click();
    await new Promise(r => setTimeout(r, 500));
    cbxLog(`after click1: open=${await verifyOpen()}`);
  }
  if (!(await verifyOpen())) {
    await el.click();
    await new Promise(r => setTimeout(r, 500));
    cbxLog(`after click2: open=${await verifyOpen()}`);
  }

  const elId = await page.evaluate((sel) => document.querySelector(sel)?.id, selector);

  // Phase 1: fuzzy match from visible options
  const pickedResult = await page.evaluate((inputId, cands) => {
    const listbox = document.getElementById('react-select-' + inputId + '-listbox');
    const opts = listbox ? Array.from(listbox.querySelectorAll('[role="option"], .select__option')) : [];
    const optTexts = opts.map(o => o.textContent.trim());
    if (!opts.length) return { picked: null, opts: optTexts };
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of cands) {
      const nc = norm(cand);
      for (const o of opts) if (norm(o.textContent) === nc) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
      for (const o of opts) if (norm(o.textContent).startsWith(nc) && nc.length >= 2) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
      if (nc.length >= 3) {
        for (const o of opts) if (norm(o.textContent).includes(nc)) { o.click(); return { picked: o.textContent.trim().substring(0,50), opts: optTexts }; }
      }
    }
    return { picked: null, opts: optTexts };
  }, elId, candidates);

  cbxLog(`phase1 opts=${JSON.stringify(pickedResult.opts)} cands=${JSON.stringify(candidates)} picked=${pickedResult.picked}`);
  if (pickedResult.picked) {
    await new Promise(r => setTimeout(r, 400));
    return true;
  }

  // Phase 2: type value and retry
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await new Promise(r => setTimeout(r, 150));
  await el.type(value, { delay: 40 });
  await new Promise(r => setTimeout(r, 1200));

  const picked2 = await page.evaluate((inputId, cands) => {
    const listbox = document.getElementById('react-select-' + inputId + '-listbox');
    const opts = listbox ? Array.from(listbox.querySelectorAll('[role="option"], .select__option')) : [];
    if (!opts.length) return null;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of cands) {
      const nc = norm(cand);
      for (const o of opts) if (norm(o.textContent).includes(nc) && nc.length >= 2) { o.click(); return o.textContent.trim().substring(0,50); }
    }
    return null;
  }, elId, candidates);

  if (!picked2) {
    await page.keyboard.press("Escape");
    await new Promise(r => setTimeout(r, 200));
    return false;
  }
  await new Promise(r => setTimeout(r, 400));
  return true;
}

/**
 * Type into a simple text input by element ID.
 */
export async function fillInput(page, id, value) {
  const sel = (/^\d/.test(id) || id.includes("[")) ? `[id="${id}"]` : `#${id}`;
  const el = await page.$(sel);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 20 });
  return true;
}

/**
 * Extract combobox dropdown options (for LLM context).
 */
async function getComboboxOptions(page, inputId) {
  const sel = (/^\d/.test(inputId) || inputId.includes("[")) ? `[id="${inputId}"]` : `#${inputId}`;
  const el = await page.$(sel);
  if (!el) return null;
  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await new Promise(r => setTimeout(r, 150));
  await el.focus();
  await page.keyboard.press("ArrowDown");
  await new Promise(r => setTimeout(r, 500));
  const options = await page.evaluate((s) => {
    const inp = document.querySelector(s);
    if (!inp) return [];
    const lb = document.getElementById("react-select-" + inp.id + "-listbox");
    if (!lb) return [];
    return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
  }, sel);
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 200));
  return options.length ? options : null;
}

/**
 * Build a CSS selector for a field ID.
 */
function idSelector(id) {
  return (/^\d/.test(id) || id.includes("[")) ? `[id="${id}"]` : `#${id}`;
}

// ── Form Sections ──

/**
 * Fill the basic identity fields (name, email, phone, country, location).
 */
export async function fillBasicFields(page, profile) {
  await fillInput(page, "first_name", profile.firstName);
  await fillInput(page, "last_name", profile.lastName);
  await fillInput(page, "email", profile.email);
  await fillInput(page, "phone", profile.phone);

  await fillCombobox(page, "#country", profile.country || "United States");

  const locSelector = (await page.$("#candidate-location")) ? "#candidate-location" : "#auto_complete_input";
  await fillCombobox(page, locSelector, profile.city || "New York");
}

/**
 * Upload resume PDF or paste resume text as fallback.
 */
export async function uploadResume(page, profile) {
  const resumePath = profile.resumePath;
  if (resumePath && existsSync(resumePath)) {
    const fileInput = await page.$("#resume");
    if (!fileInput) {
      const oldFileInput = await page.$("#s3_upload_for_resume input[type='file']");
      if (oldFileInput) await oldFileInput.uploadFile(resumePath);
    } else {
      await fileInput.uploadFile(resumePath);
    }
    await new Promise(r => setTimeout(r, 3000));
  } else if (profile.resumeText) {
    await page.evaluate(() => {
      const pasteBtn = document.querySelector('button[data-source="paste"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes("Enter manually"));
      if (pasteBtn) pasteBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate((text) => {
      const ta = document.querySelector('textarea[name*="resume_text"], textarea');
      if (ta) { ta.focus(); ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); }
    }, profile.resumeText);
  }
}

/**
 * Fill the education section from the profile.
 */
export async function fillEducation(page, profile) {
  const hasSchool = await page.$("#school--0");
  if (hasSchool) {
    await fillCombobox(page, "#school--0", profile.school);
    await fillCombobox(page, "#degree--0", profile.degree || "Master's");
    // Use a broader discipline match since Greenhouse dropdowns use generic categories
    await fillCombobox(page, "#discipline--0", profile.disciplineCategory || "Business");
    await fillInput(page, "start-year--0", profile.eduStartYear || "2023");
    await fillInput(page, "end-year--0", profile.graduationYear || "2025");
    await fillCombobox(page, "#start-month--0", profile.eduStartMonth || "September");
    await fillCombobox(page, "#end-month--0", profile.graduationMonth || "May");
  } else {
    const hasOldEdu = await page.evaluate(() => !!document.querySelector("#education_degree_0"));
    if (hasOldEdu) {
      const degreeTerm = profile.degree?.includes("Master") ? "Master" : "Bachelor";
      await page.evaluate((term) => {
        for (const sel of ["#education_degree_0", "#education_degree"]) {
          const el = document.querySelector(sel);
          if (el) { for (const opt of el.options) { if (opt.textContent.includes(term)) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); break; } } }
        }
      }, degreeTerm);
    }
  }
}

/**
 * Scan all form questions and extract metadata.
 */
export async function scanQuestions(page) {
  return page.evaluate(() => {
    const qs = [];
    // React-style: inputs with question_ IDs
    document.querySelectorAll("input[id^='question_'], textarea[id^='question_']").forEach(el => {
      let label = "";
      try { const direct = document.querySelector('label[for="' + el.id + '"]'); if (direct) label = direct.textContent.trim(); } catch {}
      if (!label) {
        const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
        label = container?.querySelector("label")?.textContent?.trim() || "";
      }
      if (!label) label = el.getAttribute("aria-label") || "";
      qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: el.getAttribute("role") === "combobox" });
    });
    // Old-style: answers_attributes
    document.querySelectorAll("select[name*='answers_attributes'], input[name*='answers_attributes'], textarea[name*='answers_attributes']").forEach(el => {
      if (el.id?.startsWith("question_")) return;
      const container = el.closest(".field") || el.parentElement;
      const label = container?.querySelector("label")?.textContent?.trim() || "";
      qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: false, name: el.name });
    });
    // EEO/demographic comboboxes (numeric IDs)
    const seenIds = new Set(qs.map(q => q.id));
    document.querySelectorAll("input[role='combobox']").forEach(el => {
      if (seenIds.has(el.id)) return;
      if (el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline") || el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id === "country" || el.id === "candidate-location" || el.id?.startsWith("iti")) return;
      let label = "";
      const container = el.closest("[class*='field'], [class*='question'], fieldset, [class*='demographic']") || el.parentElement?.parentElement?.parentElement?.parentElement;
      if (container) { const lbl = container.querySelector("label"); if (lbl) label = lbl.textContent.trim(); }
      if (!label) label = el.getAttribute("aria-label") || "";
      if (!label) { const lblId = el.getAttribute("aria-labelledby"); if (lblId) { const lblEl = document.getElementById(lblId); if (lblEl) label = lblEl.textContent.trim(); } }
      if (!label) {
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++) {
          const lbl = p.querySelector("label, legend, h3, h4, [class*='label']");
          if (lbl && lbl.textContent.trim().length > 2) { label = lbl.textContent.trim(); break; }
          p = p.parentElement;
        }
      }
      qs.push({ id: el.id, tag: el.tagName, type: el.type, role: "combobox", label: label || `unlabeled_combo_${el.id}`, isCombobox: true });
    });
    // Native <select> elements
    document.querySelectorAll("select").forEach(el => {
      if (el.id && qs.some(q => q.id === el.id)) return;
      if (!el.id && !el.name) return;
      if (el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline")) return;
      let label = "";
      const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
      if (container) { const lbl = container.querySelector("label"); if (lbl) label = lbl.textContent.trim(); }
      if (!label) label = el.getAttribute("aria-label") || "";
      if (!label) { const lblId = el.getAttribute("aria-labelledby"); if (lblId) { const lblEl = document.getElementById(lblId); if (lblEl) label = lblEl.textContent.trim(); } }
      qs.push({ id: el.id || "", name: el.name || "", tag: "SELECT", type: "select-one", role: null, label: label || `unlabeled_select_${el.id || el.name}`, isCombobox: false, isNativeSelect: true, options: Array.from(el.options).map(o => o.textContent.trim()).filter(Boolean) });
    });
    return qs;
  });
}

/**
 * Answer all scanned questions using the 3-layer field resolver.
 */
export async function answerQuestions(page, questions, profile, opts = {}) {
  const useLLM = opts.useLLM !== false;

  for (const q of questions) {
    try {
      const fieldType = q.isCombobox ? "combobox" : q.isNativeSelect ? "select" : "text";

      let options = q.options || null;
      let { value: answer, source } = await resolveField(
        q.label, fieldType, options, profile, { useLLM: false }
      );

      if (!answer && source === "none" && useLLM) {
        if (q.isCombobox && !options) {
          options = await getComboboxOptions(page, q.id);
        }
        const llmResult = await resolveField(
          q.label, fieldType, options, profile, { useLLM: true }
        );
        answer = llmResult.value;
        source = llmResult.source;
      }

      if (source === "llm") {
        console.log(`     [LLM] "${q.label.slice(0, 50)}" -> "${(answer || "").slice(0, 40)}"`);
      }

      if (!answer && answer !== "") continue;

      const sel = idSelector(q.id);

      if (q.isCombobox) {
        await fillCombobox(page, sel, answer);
      } else if (q.isNativeSelect) {
        await page.evaluate((id, name, val) => {
          const el = id ? document.getElementById(id) : document.querySelector(`[name="${name}"]`);
          if (!el) return;
          const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const target = norm(val);
          for (const opt of el.options) {
            if (norm(opt.textContent) === target || norm(opt.textContent).includes(target)) {
              el.value = opt.value;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return;
            }
          }
          if (el.options.length > 1) {
            el.value = el.options[1].value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, q.id, q.name, answer);
      } else {
        if (answer) await fillInput(page, q.id, answer);
      }
    } catch (err) {
      // Log but don't fail
    }
  }
}

/**
 * Detect and fill EEO/demographic fields by reading dropdown options.
 */
export async function fillEEOFields(page, profile) {
  const eeoFields = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("input[role='combobox']").forEach(el => {
      if (["country", "candidate-location"].includes(el.id)) return;
      if (el.id?.startsWith("school") || el.id?.startsWith("degree") || el.id?.startsWith("discipline") || el.id?.startsWith("start-") || el.id?.startsWith("end-") || el.id?.startsWith("iti") || el.id?.startsWith("question_")) return;
      const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
      const hasValue = ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
      if (hasValue) return;
      results.push({ id: el.id });
    });
    return results;
  });

  for (const eeo of eeoFields) {
    const sel = idSelector(eeo.id);

    // Read dropdown options to detect field type
    let opts = await page.evaluate((selector) => {
      const inp = document.querySelector(selector);
      if (!inp) return [];
      const lb = document.querySelector(`#react-select-${inp.id}-listbox`);
      if (!lb) return [];
      return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
    }, sel);

    if (!opts.length) {
      const el = await page.$(sel);
      if (el) {
        await el.evaluate(n => n.scrollIntoView({ block: "center" }));
        await new Promise(r => setTimeout(r, 200));
        await el.focus();
        await page.keyboard.press("ArrowDown");
        await new Promise(r => setTimeout(r, 400));
        opts = await page.evaluate((selector) => {
          const inp = document.querySelector(selector);
          if (!inp) return [];
          const lb = document.querySelector(`#react-select-${inp.id}-listbox`);
          if (!lb) return [];
          return Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim());
        }, sel);
        await page.keyboard.press("Escape");
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const joined = opts.join(" ").toLowerCase();
    let answer;
    if (joined.includes("heterosexual") || joined.includes("bisexual") || joined.includes("homosexual")) {
      answer = profile.sexualOrientation || "Decline";
    } else if (joined.includes("asian") || joined.includes("african") || joined.includes("hispanic") || joined.includes("indigenous")) {
      answer = profile.race || "Decline";
    } else if (joined.includes("disability") || joined.includes("disabled")) {
      answer = profile.disability === "No" ? "No" : (profile.disability || "Decline");
    } else if (joined.includes("veteran") || joined.includes("military")) {
      answer = profile.veteranStatus === "No" ? "I am not a veteran" : (profile.veteranStatus || "Decline");
    } else if (joined.includes("non-binary") || joined.includes("i prefer to self-describe")) {
      answer = profile.gender || "Decline";
    } else if (joined.includes("male") || joined.includes("female")) {
      answer = profile.gender || "Decline";
    } else {
      answer = "Decline";
    }
    try { await fillCombobox(page, sel, answer); } catch {}
  }
}

/**
 * Re-fill education fields if they got cleared by later form interactions.
 */
export async function refillEducation(page, profile) {
  const schoolEmpty = await page.evaluate(() => {
    const el = document.querySelector("#school--0");
    if (!el) return false;
    const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
    return !ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
  });
  if (schoolEmpty) {
    await fillCombobox(page, "#school--0", profile.school);
    await fillCombobox(page, "#degree--0", profile.degree || "Master of Science");
    await fillCombobox(page, "#discipline--0", profile.disciplineCategory || "Business");
  }
}

/**
 * Check all consent/GDPR checkboxes.
 */
export async function checkConsent(page) {
  await page.evaluate(() => {
    document.querySelectorAll("input[type='checkbox']").forEach(cb => { if (!cb.checked) cb.click(); });
  });
}

/**
 * Trigger reCAPTCHA Enterprise token generation.
 */
export async function triggerRecaptcha(page) {
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(async () => {
    try {
      if (typeof grecaptcha !== "undefined") {
        const key = typeof JBEN !== "undefined" ? JBEN?.Recaptcha?.publicKey : document.querySelector("[data-sitekey]")?.getAttribute("data-sitekey");
        if (key) {
          const token = await grecaptcha.enterprise.execute(key, { action: "apply_to_job" });
          let input = document.querySelector('input[name="g-recaptcha-enterprise-token"]');
          if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = "g-recaptcha-enterprise-token"; const form = document.querySelector("#application-form, #application_form"); if (form) form.appendChild(input); }
          if (input) input.value = token;
        }
      }
    } catch {}
  });
}

/**
 * Dump all filled field values (for debugging).
 */
export async function dumpFilledFields(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll("input[type='text'], input[type='email'], input[type='tel'], input[type='search'], textarea, select").forEach(el => {
      if (!el.id && !el.name) return;
      const container = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
      const label = container?.querySelector("label")?.textContent?.trim().substring(0, 60) || "";
      let value = (el.value || "").substring(0, 40);
      if (el.getAttribute("role") === "combobox") {
        const selDisplay = container?.querySelector(".select__single-value, .select__multi-value__label");
        if (selDisplay) value = "<" + selDisplay.textContent.trim().substring(0, 40) + ">";
      }
      out.push({ id: el.id, label, value, role: el.getAttribute("role") });
    });
    return out;
  });
}

/**
 * Submit the application form and wait for result.
 */
export async function submitForm(page) {
  const submitClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const submitBtn = btns.find(b => b.textContent.toLowerCase().includes("submit")) || document.querySelector("#submit_app");
    if (submitBtn) { submitBtn.click(); return true; }
    return false;
  });
  if (!submitClicked) return { success: false, error: "No submit button found" };

  await new Promise(r => setTimeout(r, 12_000));
  return null; // caller should check result
}

/**
 * Check the result of form submission.
 */
export async function checkResult(page) {
  const finalUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText);

  if (finalUrl.includes("confirmation") || bodyText.toLowerCase().includes("thank you") || bodyText.toLowerCase().includes("submitted") || bodyText.toLowerCase().includes("we have received")) {
    return { success: true, message: "Application submitted!" };
  }

  // Check for security code
  const securityCodeVisible = await page.evaluate(() => {
    const field = document.querySelector("#security_code, input[name='security_code'], [aria-label*='security'], [aria-label*='Security'], [aria-label*='verification'], [placeholder*='code']");
    if (field && field.offsetParent !== null) return true;
    const text = document.body.innerText.toLowerCase();
    return text.includes("verification code") || text.includes("security code") || text.includes("6-character code");
  });

  if (securityCodeVisible) {
    return { success: false, error: "Security code required", needsCode: true };
  }

  // Check validation errors
  const errors = await page.evaluate(() => {
    const errs = [];
    document.querySelectorAll(".field_with_errors, [class*='error'], [class*='invalid']").forEach(f => {
      const text = f.textContent?.trim().substring(0, 60);
      if (text && !errs.includes(text)) errs.push(text);
    });
    return errs.slice(0, 5);
  });

  if (errors.length > 0) {
    return { success: false, error: `Validation: ${errors[0]}` };
  }

  return { success: false, error: "Unclear result" };
}

/**
 * Handle security code entry by polling a file or env var.
 */
export async function handleSecurityCode(page, boardToken, jobId, opts = {}) {
  const timeout = opts.timeout || 300_000; // 5 min default
  const pollInterval = opts.pollInterval || 3000;
  const codeFilePath = opts.codeFilePath || `/tmp/code_${boardToken}_${jobId}.txt`;

  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Check env var
    if (process.env.SECURITY_CODE) {
      const code = process.env.SECURITY_CODE;
      delete process.env.SECURITY_CODE;
      return await enterSecurityCode(page, code);
    }
    // Check file
    if (existsSync(codeFilePath)) {
      const code = readFileSync(codeFilePath, "utf8").trim();
      if (code.length >= 4) {
        return await enterSecurityCode(page, code);
      }
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }
  return { success: false, error: `Code file not provided within ${Math.round(timeout / 60000)} min timeout` };
}

async function enterSecurityCode(page, code) {
  const codeField = await page.$("#security_code") ||
    await page.$("input[name='security_code']") ||
    await page.$("[aria-label*='security']") ||
    await page.$("[aria-label*='verification']") ||
    await page.$("[placeholder*='code']");
  if (!codeField) return { success: false, error: "Security code field not found" };

  await codeField.click({ clickCount: 3 });
  await codeField.type(code, { delay: 30 });

  const verifyBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find(b => b.textContent.toLowerCase().includes("verify") || b.textContent.toLowerCase().includes("confirm"));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!verifyBtn) return { success: false, error: "Verify button not found" };

  await new Promise(r => setTimeout(r, 5000));
  return checkResult(page);
}

// ── Top-Level Orchestrator ──

/**
 * Apply to a single Greenhouse job via headless Chrome.
 *
 * @param {object} opts
 * @param {string} opts.chromePath - Path to Chrome executable
 * @param {string} opts.boardToken - Greenhouse board token
 * @param {string} opts.jobId - Job ID
 * @param {object} opts.profile - Candidate profile object
 * @param {boolean} [opts.useLLM=true] - Enable LLM fallback
 * @param {boolean} [opts.debugNoSubmit=false] - Fill form but don't submit
 * @returns {Promise<{ success: boolean, error?: string, message?: string }>}
 */
export async function applyToJob({ chromePath, boardToken, jobId, profile, useLLM = true, debugNoSubmit = false }) {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 900 });

    const embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
    await page.goto(embedUrl, { waitUntil: "networkidle2", timeout: 30_000 });

    // Detect form style
    const formStyle = await page.evaluate(() => {
      if (document.querySelector("#application_form")) return "old";
      if (document.querySelector("#application-form") || document.querySelector(".application--form")) return "react";
      return "unknown";
    });
    if (formStyle === "unknown") {
      return { success: false, error: "No application form found" };
    }

    await page.waitForSelector("#first_name", { timeout: 10_000 });

    // Fill all sections
    await fillBasicFields(page, profile);
    await uploadResume(page, profile);
    await fillEducation(page, profile);

    // Scan and answer questions
    const questions = await scanQuestions(page);
    console.log(`   Scanned ${questions.length} questions:`);
    for (const q of questions) {
      console.log(`     [${q.tag}${q.isCombobox ? ":combo" : q.isNativeSelect ? ":select" : ""}] ${q.label.slice(0, 70)}${q.options ? ` | opts=${q.options.slice(0,5).join(",")}` : ""}`);
    }
    await answerQuestions(page, questions, profile, { useLLM });

    // EEO fields
    await fillEEOFields(page, profile);

    // Re-fill education if cleared
    await refillEducation(page, profile);

    // Consent checkboxes
    await checkConsent(page);

    // reCAPTCHA
    await triggerRecaptcha(page);

    // Debug mode
    if (debugNoSubmit) {
      const dump = await dumpFilledFields(page);
      console.log("\n── Filled fields dump ──");
      for (const f of dump) console.log(`  [${f.role || f.id.substring(0,20)}] ${f.label.padEnd(45)} = "${f.value}"`);
      try { await page.screenshot({ path: `/tmp/apply_debug_${boardToken}_${jobId}.png`, fullPage: true }); } catch {}
      return { success: false, error: "DEBUG_NO_SUBMIT set — not submitting" };
    }

    // Submit
    const submitResult = await submitForm(page);
    if (submitResult) return submitResult;

    // Screenshot
    try { await page.screenshot({ path: `/tmp/apply_${boardToken}_${jobId}.png`, fullPage: true }); } catch {}

    // Check result
    const result = await checkResult(page);

    // Handle security code if needed
    if (result.needsCode) {
      return handleSecurityCode(page, boardToken, jobId);
    }

    return result;
  } catch (err) {
    return { success: false, error: err.message?.substring(0, 80) };
  } finally {
    await browser.close();
  }
}
