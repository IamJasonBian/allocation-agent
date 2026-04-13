import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectCaptcha,
  parseFormTokens,
  parseFormFields,
  parseRemixContext,
  extractReactFormData,
  normalizeReactQuestions,
} from "../apply-operator.mjs";

describe("detectCaptcha", () => {
  it("returns none when no captcha present", () => {
    const r = detectCaptcha("<html><body><form></form></body></html>");
    assert.equal(r.type, "none");
    assert.equal(r.sitekey, null);
  });

  it("detects reCAPTCHA Enterprise", () => {
    const html = '<script src="https://www.google.com/recaptcha/enterprise.js?render=6LeSITEKEY"></script>';
    const r = detectCaptcha(html);
    assert.equal(r.type, "enterprise");
    assert.equal(r.sitekey, "6LeSITEKEY");
  });

  it("detects reCAPTCHA v3", () => {
    const html = '<script src="https://www.google.com/recaptcha/api.js?render=6LeSITEKEY"></script>';
    const r = detectCaptcha(html);
    assert.equal(r.type, "v3");
    assert.equal(r.sitekey, "6LeSITEKEY");
  });

  it("detects reCAPTCHA v2", () => {
    const html = '<div class="g-recaptcha" data-sitekey="6LeV2KEY"></div>';
    const r = detectCaptcha(html);
    assert.equal(r.type, "v2");
    assert.equal(r.sitekey, "6LeV2KEY");
  });

  it("detects hCaptcha", () => {
    const html = '<div class="h-captcha" data-sitekey="hcSITEKEY"></div>';
    const r = detectCaptcha(html);
    assert.equal(r.type, "hcaptcha");
    assert.equal(r.sitekey, "hcSITEKEY");
  });

  it("returns unknown for ambiguous recaptcha reference", () => {
    const html = '<script>// recaptcha integration</script>';
    const r = detectCaptcha(html);
    assert.equal(r.type, "unknown");
  });
});

describe("parseFormTokens", () => {
  it("extracts fingerprint, render_date, page_load_time from legacy form", () => {
    const html = `
      <input name="fingerprint" value="abc123">
      <input name="render_date" value="2024-01-01">
      <input name="page_load_time" value="42">
    `;
    const tokens = parseFormTokens(html);
    assert.equal(tokens.fingerprint, "abc123");
    assert.equal(tokens.renderDate, "2024-01-01");
    assert.equal(tokens.pageLoadTime, "42");
  });

  it("returns null when tokens are missing", () => {
    const tokens = parseFormTokens("<html><body></body></html>");
    assert.equal(tokens, null);
  });
});

describe("parseFormFields", () => {
  it("extracts question fields from legacy embed HTML", () => {
    const html = `
      <input name="job_application[answers_attributes][0][question_id]" value="100">
      <input name="job_application[answers_attributes][0][boolean_value]">
      <label>Are you authorized?</label>
      <input name="job_application[answers_attributes][1][question_id]" value="200">
      <label>LinkedIn URL</label>
    `;
    const fields = parseFormFields(html);
    assert.equal(fields.length, 2);
    assert.equal(fields[0].questionId, "100");
    assert.equal(fields[0].fieldType, "boolean");
    assert.equal(fields[1].questionId, "200");
    assert.equal(fields[1].fieldType, "text");
  });
});

describe("parseRemixContext", () => {
  it("parses valid __remixContext", () => {
    const html = 'window.__remixContext = {"state":{"loaderData":{"root":{}}}};';
    const ctx = parseRemixContext(html);
    assert.ok(ctx);
    assert.ok(ctx.state);
  });

  it("returns null when not present", () => {
    const ctx = parseRemixContext("<html><body></body></html>");
    assert.equal(ctx, null);
  });

  it("returns null for malformed JSON", () => {
    const html = 'window.__remixContext = {broken json;';
    const ctx = parseRemixContext(html);
    assert.equal(ctx, null);
  });
});

describe("extractReactFormData", () => {
  it("extracts jobPost data from Remix context", () => {
    const ctx = {
      state: {
        loaderData: {
          root: {},
          "routes/$url_token_.jobs_.$job_post_id": {
            jobPostId: "123",
            urlToken: "testboard",
            submitPath: "https://boards.greenhouse.io/embed/testboard/jobs/123",
            confirmationPath: "/testboard/jobs/123/confirmation",
            jobPost: {
              fingerprint: "fp123",
              questions: [
                { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
              ],
              education_config: null,
              enable_eeoc: false,
              eeoc_sections: [],
              title: "Test Job",
            },
          },
        },
      },
    };
    const form = extractReactFormData(ctx);
    assert.ok(form);
    assert.equal(form.jobPostId, "123");
    assert.equal(form.submitPath, "https://boards.greenhouse.io/embed/testboard/jobs/123");
    assert.equal(form.fingerprint, "fp123");
    assert.equal(form.questions.length, 1);
  });

  it("returns null when no jobPost found", () => {
    const ctx = { state: { loaderData: { root: {} } } };
    assert.equal(extractReactFormData(ctx), null);
  });
});

describe("normalizeReactQuestions", () => {
  it("normalizes text input questions", () => {
    const questions = [
      { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
    ];
    const normalized = normalizeReactQuestions(questions);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].label, "First Name");
    assert.equal(normalized[0].fieldType, "text");
    assert.equal(normalized[0].fieldName, "first_name");
    assert.equal(normalized[0].required, true);
  });

  it("normalizes file input", () => {
    const questions = [
      { required: true, label: "Resume", fields: [{ name: "resume", type: "input_file" }] },
    ];
    const normalized = normalizeReactQuestions(questions);
    assert.equal(normalized[0].fieldType, "file");
  });

  it("normalizes single-select combobox with options", () => {
    const questions = [
      {
        required: true,
        label: "Authorized?",
        fields: [{
          name: "q_100",
          type: "multi_value_single_select",
          values: [{ value: 1, label: "Yes" }, { value: 0, label: "No" }],
        }],
      },
    ];
    const normalized = normalizeReactQuestions(questions);
    assert.equal(normalized[0].fieldType, "combobox");
    assert.equal(normalized[0].options.length, 2);
    assert.equal(normalized[0].options[0].text, "Yes");
  });

  it("normalizes multi-select", () => {
    const questions = [
      {
        required: false,
        label: "Languages",
        fields: [{
          name: "q_200[]",
          type: "multi_value_multi_select",
          values: [{ value: 1, label: "English" }, { value: 2, label: "Hindi" }],
        }],
      },
    ];
    const normalized = normalizeReactQuestions(questions);
    assert.equal(normalized[0].fieldType, "multiselect");
    assert.equal(normalized[0].options.length, 2);
  });
});
