/**
 * Browser Form Filler — Puppeteer-based autofill for Greenhouse React forms.
 *
 * Extracted from batch-browser-apply-aastha.mjs. Handles:
 * - React Select comboboxes (fuzzy-match + synonym expansion)
 * - Text inputs, textareas, native selects
 * - Education comboboxes (school, degree, discipline, dates)
 * - EEO/demographic fields (detected by option content)
 * - File upload (resume PDF)
 * - Checkbox bulk-check (consent/GDPR)
 * - 3-layer field resolution (heuristic → LLM)
 *
 * Usage:
 *   import { fillFormInBrowser } from './browser-fill.mjs';
 *   const result = await fillFormInBrowser(page, profile, { useLLM: false });
 */

import { resolveField, getSynonyms } from "./field-resolver.mjs";

// ── Combobox filler: open dropdown, enumerate options, fuzzy-match ──

async function fillCombobox(page, selector, value) {
  const el = await page.$(selector);
  if (!el) return false;

  const candidates = getSynonyms(value);
  const v = value.toLowerCase();

  // Extra synonyms for months and GPA
  const months = { january:"01", february:"02", march:"03", april:"04", may:"05", june:"06",
    july:"07", august:"08", september:"09", october:"10", november:"11", december:"12" };
  if (months[v]) candidates.push(value, v.substring(0,3).charAt(0).toUpperCase() + v.substring(1,3), months[v]);
  if (v.startsWith("3.")) candidates.push("3.4 or higher", "3.5-3.9", "3.5-4.0", "3.0-3.9", value);
  if (v === "consent") candidates.push("Consent", "I consent", "Yes");

  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { if (document.activeElement?.blur) document.activeElement.blur(); });
  await new Promise(r => setTimeout(r, 100));
  await el.focus();
  await new Promise(r => setTimeout(r, 150));

  const verifyOpen = async () => await page.evaluate((sel) => {
    const inp = document.querySelector(sel);
    if (!inp) return false;
    const lb = document.getElementById("react-select-" + inp.id + "-listbox");
    return !!(lb && lb.querySelector("[role='option'], .select__option"));
  }, selector);

  await page.keyboard.press("ArrowDown");
  await new Promise(r => setTimeout(r, 400));
  if (!(await verifyOpen())) { await el.click(); await new Promise(r => setTimeout(r, 500)); }
  if (!(await verifyOpen())) { await el.click(); await new Promise(r => setTimeout(r, 500)); }

  const elId = await page.evaluate((sel) => document.querySelector(sel)?.id, selector);

  // Phase 1: fuzzy-match from open option list
  const picked = await page.evaluate((inputId, cands) => {
    const lb = document.getElementById("react-select-" + inputId + "-listbox");
    const opts = lb ? Array.from(lb.querySelectorAll('[role="option"], .select__option')) : [];
    if (!opts.length) return null;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of cands) {
      const nc = norm(cand);
      for (const o of opts) if (norm(o.textContent) === nc) { o.click(); return o.textContent.trim(); }
      for (const o of opts) if (norm(o.textContent).startsWith(nc) && nc.length >= 2) { o.click(); return o.textContent.trim(); }
      if (nc.length >= 3) for (const o of opts) if (norm(o.textContent).includes(nc)) { o.click(); return o.textContent.trim(); }
    }
    return null;
  }, elId, candidates);

  if (picked) { await new Promise(r => setTimeout(r, 400)); return true; }

  // Phase 2: type value and retry
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await new Promise(r => setTimeout(r, 150));
  await el.type(value, { delay: 40 });
  await new Promise(r => setTimeout(r, 1200));

  const picked2 = await page.evaluate((inputId, cands) => {
    const lb = document.getElementById("react-select-" + inputId + "-listbox");
    const opts = lb ? Array.from(lb.querySelectorAll('[role="option"], .select__option')) : [];
    if (!opts.length) return null;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of cands) {
      const nc = norm(cand);
      for (const o of opts) if (norm(o.textContent).includes(nc) && nc.length >= 2) { o.click(); return o.textContent.trim(); }
    }
    return null;
  }, elId, candidates);

  if (!picked2) { await page.keyboard.press("Escape"); await new Promise(r => setTimeout(r, 200)); return false; }
  await new Promise(r => setTimeout(r, 400));
  return true;
}

async function fillInput(page, id, value) {
  const escapedId = id.replace(/([[\]()])/g, "\\$1");
  const el = await page.$(`#${escapedId}`);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 20 });
  return true;
}

async function getComboboxOptions(page, id) {
  const sel = /^\d/.test(id) ? `[id="${id}"]` : `#${id.replace(/([[\]()])/g, "\\$1")}`;
  const el = await page.$(sel);
  if (!el) return [];
  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await el.focus();
  await page.keyboard.press("ArrowDown");
  await new Promise(r => setTimeout(r, 500));
  const opts = await page.evaluate((s) => {
    const inp = document.querySelector(s);
    if (!inp) return [];
    const lb = document.getElementById("react-select-" + inp.id + "-listbox");
    return lb ? Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim()) : [];
  }, sel);
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 200));
  return opts;
}

// ── Main: fill a Greenhouse form in a live browser page ──

/**
 * @param {import('puppeteer-core').Page} page - Active Puppeteer page with form loaded
 * @param {object} profile - Candidate profile (from candidate-profile-aastha.mjs)
 * @param {{ useLLM?: boolean, resumePath?: string }} opts
 * @returns {Promise<{ filled: number, total: number, resumeUploaded: boolean, details: string[] }>}
 */
export async function fillFormInBrowser(page, profile, opts = {}) {
  const useLLM = opts.useLLM ?? false;
  const details = [];
  let filled = 0;

  // ── 1. Core text fields ──
  const coreFields = [
    ["first_name", profile.firstName],
    ["last_name", profile.lastName],
    ["email", profile.email],
    ["phone", profile.phone || profile.phoneRaw],
  ];
  for (const [id, val] of coreFields) {
    if (await fillInput(page, id, val)) { filled++; details.push(`core:${id}`); }
  }

  // ── 2. Country + Location comboboxes ──
  if (await fillCombobox(page, "#country", profile.country || "United States")) { filled++; details.push("country"); }
  const locSel = (await page.$("#candidate-location")) ? "#candidate-location" : "#auto_complete_input";
  if (await fillCombobox(page, locSel, profile.city || "New York")) { filled++; details.push("location"); }

  // ── 3. Resume upload ──
  let resumeUploaded = false;
  const resumePath = opts.resumePath || profile.resumePath;
  if (resumePath) {
    const fileInput = await page.$("#resume") || await page.$('#s3_upload_for_resume input[type="file"]') || await page.$('input[type="file"]');
    if (fileInput) {
      try {
        await fileInput.uploadFile(resumePath);
        await new Promise(r => setTimeout(r, 3000));
        resumeUploaded = true;
        filled++;
        details.push("resume:uploaded");
      } catch (err) {
        details.push("resume:error:" + err.message);
        // Fallback to resume text
        await page.evaluate((text) => {
          const btn = document.querySelector('button[data-source="paste"]') || Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Enter manually"));
          if (btn) btn.click();
        }, "");
        await new Promise(r => setTimeout(r, 500));
        await page.evaluate((text) => {
          const ta = document.querySelector('textarea[name*="resume_text"], textarea');
          if (ta) { ta.focus(); ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); }
        }, profile.resumeText || "");
      }
    }
  }

  // ── 4. Education comboboxes ──
  if (await page.$("#school--0")) {
    if (await fillCombobox(page, "#school--0", profile.school)) { filled++; details.push("edu:school"); }
    if (await fillCombobox(page, "#degree--0", profile.degree)) { filled++; details.push("edu:degree"); }
    if (await fillCombobox(page, "#discipline--0", profile.discipline || "Business")) { filled++; details.push("edu:discipline"); }
    if (await fillInput(page, "start-year--0", String(profile.startYearEdu || 2023))) { filled++; details.push("edu:startYear"); }
    if (await fillInput(page, "end-year--0", String(profile.graduationYear))) { filled++; details.push("edu:endYear"); }
    if (await fillCombobox(page, "#start-month--0", profile.startMonthEduName || "September")) { filled++; details.push("edu:startMonth"); }
    if (await fillCombobox(page, "#end-month--0", profile.graduationMonth || "May")) { filled++; details.push("edu:endMonth"); }
  } else {
    // Old-style education dropdowns
    const hasOldEdu = await page.evaluate(() => !!document.querySelector("#education_degree_0"));
    if (hasOldEdu) {
      await page.evaluate(() => {
        for (const sel of ["#education_degree_0", "#education_degree"]) {
          const el = document.querySelector(sel);
          if (el) { for (const opt of el.options) { if (opt.textContent.includes("Master")) { el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); break; } } }
        }
      });
      filled++;
      details.push("edu:old-style");
    }
  }

  // ── 5. Scan all question fields from the DOM ──
  const questions = await page.evaluate(() => {
    const qs = [];
    const seenIds = new Set();

    // React-style question inputs
    document.querySelectorAll("input[id^='question_'], textarea[id^='question_']").forEach(el => {
      let label = "";
      try { const lbl = document.querySelector('label[for="' + el.id + '"]'); if (lbl) label = lbl.textContent.trim(); } catch {}
      if (!label) {
        const c = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
        label = c?.querySelector("label")?.textContent?.trim() || "";
      }
      if (!label) label = el.getAttribute("aria-label") || "";
      qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: el.getAttribute("role") === "combobox" });
      seenIds.add(el.id);
    });

    // Old-style answers_attributes
    document.querySelectorAll("select[name*='answers_attributes'], input[name*='answers_attributes'], textarea[name*='answers_attributes']").forEach(el => {
      if (el.id && seenIds.has(el.id)) return;
      const c = el.closest(".field") || el.parentElement;
      const label = c?.querySelector("label")?.textContent?.trim() || "";
      qs.push({ id: el.id, tag: el.tagName, type: el.type, role: el.getAttribute("role"), label, isCombobox: false, name: el.name });
      if (el.id) seenIds.add(el.id);
    });

    // EEO/demographic comboboxes (numeric IDs)
    document.querySelectorAll("input[role='combobox']").forEach(el => {
      if (seenIds.has(el.id)) return;
      if (["country", "candidate-location"].includes(el.id)) return;
      if (el.id?.match(/^(school|degree|discipline|start-|end-|iti)/)) return;
      let label = "";
      const c = el.closest("[class*='field'], [class*='question'], fieldset, [class*='demographic']") || el.parentElement?.parentElement?.parentElement?.parentElement;
      if (c) { const lbl = c.querySelector("label"); if (lbl) label = lbl.textContent.trim(); }
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
      seenIds.add(el.id);
    });

    // Native <select> elements
    document.querySelectorAll("select").forEach(el => {
      if (el.id && seenIds.has(el.id)) return;
      if (!el.id && !el.name) return;
      if (el.id?.match(/^(start-|end-|school|degree|discipline)/)) return;
      let label = "";
      const c = el.closest("[class*='field'], [class*='question'], fieldset") || el.parentElement?.parentElement;
      if (c) { const lbl = c.querySelector("label"); if (lbl) label = lbl.textContent.trim(); }
      if (!label) label = el.getAttribute("aria-label") || "";
      qs.push({ id: el.id || "", name: el.name || "", tag: "SELECT", type: "select-one", role: null, label: label || `unlabeled_select_${el.id || el.name}`, isCombobox: false, isNativeSelect: true, options: Array.from(el.options).map(o => o.textContent.trim()).filter(Boolean) });
      if (el.id) seenIds.add(el.id);
    });

    return qs;
  });

  // ── 6. Resolve + fill each question ──
  for (const q of questions) {
    try {
      const fieldType = q.isCombobox ? "combobox" : q.isNativeSelect ? "select" : "text";
      let options = q.options || null;

      // Layer 1+2: heuristic resolve
      let { value: answer, source } = await resolveField(q.label, fieldType, options, profile, { useLLM: false });

      // Layer 3: LLM fallback if enabled
      if (!answer && source === "none" && useLLM) {
        if (q.isCombobox && !options) {
          options = await getComboboxOptions(page, q.id);
        }
        const llmResult = await resolveField(q.label, fieldType, options, profile, { useLLM: true });
        answer = llmResult.value;
        source = llmResult.source;
      }

      if (!answer && answer !== "") continue;

      const sel = (/^\d/.test(q.id) || q.id.includes("[")) ? `[id="${q.id}"]` : `#${q.id}`;

      if (q.isCombobox) {
        if (await fillCombobox(page, sel, answer)) { filled++; details.push(`q:${q.label.slice(0,30)}=${answer.slice(0,20)}`); }
      } else if (q.isNativeSelect) {
        await page.evaluate((id, name, val) => {
          const el = id ? document.getElementById(id) : document.querySelector(`[name="${name}"]`);
          if (!el) return;
          const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const target = norm(val);
          for (const opt of el.options) {
            if (norm(opt.textContent) === target || norm(opt.textContent).includes(target)) {
              el.value = opt.value; el.dispatchEvent(new Event("change", { bubbles: true })); return;
            }
          }
        }, q.id, q.name, answer);
        filled++;
        details.push(`sel:${q.label.slice(0,30)}=${answer.slice(0,20)}`);
      } else {
        if (answer && await fillInput(page, q.id, answer)) { filled++; details.push(`txt:${q.label.slice(0,30)}=${answer.slice(0,20)}`); }
      }
    } catch {}
  }

  // ── 7. EEO/Demographic: fill remaining unfilled comboboxes ──
  const eeoFields = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll("input[role='combobox']").forEach(el => {
      if (["country", "candidate-location"].includes(el.id)) return;
      if (el.id?.match(/^(school|degree|discipline|start-|end-|iti|question_)/)) return;
      const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
      if (ctrl?.querySelector("[class*='singleValue'], [class*='single-value']")) return;
      results.push({ id: el.id });
    });
    return results;
  });

  for (const eeo of eeoFields) {
    const sel = /^\d/.test(eeo.id) ? `[id="${eeo.id}"]` : `#${eeo.id.replace(/([[\]()])/g, "\\$1")}`;

    // Open dropdown to detect type by option content
    let opts = [];
    const el = await page.$(sel);
    if (el) {
      await el.evaluate(n => n.scrollIntoView({ block: "center" }));
      await new Promise(r => setTimeout(r, 200));
      await el.focus();
      await page.keyboard.press("ArrowDown");
      await new Promise(r => setTimeout(r, 400));
      opts = await page.evaluate((s) => {
        const inp = document.querySelector(s);
        if (!inp) return [];
        const lb = document.getElementById("react-select-" + inp.id + "-listbox");
        return lb ? Array.from(lb.querySelectorAll('[role="option"]')).map(o => o.textContent.trim()) : [];
      }, sel);
      await page.keyboard.press("Escape");
      await new Promise(r => setTimeout(r, 200));
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

    try {
      if (await fillCombobox(page, sel, answer)) { filled++; details.push(`eeo:${answer.slice(0,15)}`); }
    } catch {}
  }

  // ── 8. Re-fill education if it got cleared ──
  const schoolEmpty = await page.evaluate(() => {
    const el = document.querySelector("#school--0");
    if (!el) return false;
    const ctrl = el.closest("[class*='control']") || el.parentElement?.parentElement;
    return !ctrl?.querySelector("[class*='singleValue'], [class*='single-value']");
  });
  if (schoolEmpty) {
    await fillCombobox(page, "#school--0", profile.school);
    await fillCombobox(page, "#degree--0", profile.degree);
    await fillCombobox(page, "#discipline--0", profile.discipline || "Business");
    details.push("edu:refilled");
  }

  // ── 9. Check all consent/GDPR checkboxes ──
  const checked = await page.evaluate(() => {
    let count = 0;
    document.querySelectorAll("input[type='checkbox']").forEach(cb => { if (!cb.checked) { cb.click(); count++; } });
    return count;
  });
  if (checked > 0) { filled += checked; details.push(`checkboxes:${checked}`); }

  const total = coreFields.length + questions.length + eeoFields.length;
  return { filled, total, resumeUploaded, details };
}
