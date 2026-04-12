/**
 * Apply Engine — reusable job application automation pipeline.
 *
 * Modules:
 *   apply-operator  — 5-stage Greenhouse pipeline (fetch, parse, resolve, build, submit)
 *   browser-fill    — Puppeteer form filler (combobox, education, EEO, upload, checkboxes)
 *   browser-launcher — Chrome/Safari browser abstraction
 *   field-resolver  — 3-layer field resolution (heuristic -> profile -> LLM)
 */

export { prepare, submit, detectCaptcha, fetchEmbed, generateAutofillScript } from "./apply-operator.mjs";
export { fillFormInBrowser } from "./browser-fill.mjs";
export { launchBrowser } from "./browser-launcher.mjs";
export { resolveField, getSynonyms } from "./field-resolver.mjs";
