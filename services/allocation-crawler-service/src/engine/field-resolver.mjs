/**
 * Three-layer field resolver for Greenhouse job application forms.
 *
 * Layer 1: Map raw label text -> canonical field name via pattern matching
 * Layer 2: Map canonical field name -> value from candidate profile
 * Layer 3: LLM fallback via local Ollama (devstral-small-2) for unknown questions
 */

// ── Layer 1: Canonical Field Map ──
// [canonicalName, [pattern1, pattern2, ...]]
// Order matters — first match wins, so put more specific patterns before general ones.

const FIELD_MAP = [
  // Identity
  ["PREFERRED_FIRST_NAME", ["preferred first name", "preferred name", "nickname"]],
  ["LEGAL_FIRST_NAME",     ["legal first name", "legal first"]],
  ["FIRST_NAME",           ["first name", "given name"]],
  ["LEGAL_LAST_NAME",      ["legal last name", "legal last"]],
  ["LAST_NAME",            ["last name", "family name", "surname"]],
  ["FULL_NAME",            ["full name", "legal name"]],
  ["EMAIL",                ["email"]],
  ["PHONE",                ["phone", "mobile", "telephone", "cell"]],
  ["LINKEDIN",             ["linkedin"]],
  ["GITHUB",               ["github"]],
  ["WHY_INTERESTED",       ["why are you interested", "why do you want", "why this role", "why this company", "what interests you"]],
  ["WEBSITE",              ["website", "portfolio url", "personal site", "your website"]],

  // Location
  ["LOCATION_CITY",        ["location (city)", "location(city)", "city"]],
  ["LOCATION",             ["location", "where are you", "where do you live", "where do you currently reside"]],
  ["COUNTRY",              ["what country", "your country", "country of residence", "country of origin"]],
  ["STATE",                ["your state", "state of residence", "province"]],
  ["ADDRESS",              ["address", "street"]],
  ["ZIP_CODE",             ["zip", "postal"]],

  // Work authorization
  ["AUTHORIZED_TO_WORK",   ["authorized to work", "legally authorized", "eligibility to work", "right to work", "eligible to work", "authorized to work in the country"]],
  ["REQUIRES_SPONSORSHIP", ["sponsorship", "require sponsor", "require visa", "h-1b", "h1b", "immigration status", "visa status"]],

  // Education (GPA before SCHOOL so "institution" in GPA label doesn't match SCHOOL first)
  ["GPA",                  ["gpa", "grade point", "cumulative gpa", "undergraduate gpa", "current cumulative"]],
  ["SCHOOL",               ["school", "university", "college", "institution", "alma mater"]],
  ["HAS_BACHELORS",         ["do you have a bachelor", "have a bachelor"]],
  ["DEGREE",               ["degree", "level of education", "education level", "highest degree"]],
  ["DISCIPLINE",           ["discipline", "major", "field of study", "area of study", "concentration"]],
  ["GRADUATION_MONTH",     ["graduation month", "month of graduation", "anticipated month", "expected month"]],
  ["GRADUATION_YEAR",      ["graduation year", "year of graduation", "anticipated graduation", "expected graduation", "anticipated year"]],
  ["ENROLLED_MBA",         ["enrolled in an mba", "mba program", "currently enrolled"]],
  ["STANDARDIZED_TESTS",   ["standardized test", "gmat", "act score", "sat score", "test score"]],

  // Employment (NOTICE_PERIOD before CURRENT_EMPLOYER to avoid "current employer" matching in notice questions)
  ["NOTICE_PERIOD",         ["notice period"]],
  ["CURRENT_EMPLOYER",     ["current company", "current employer", "company name"]],
  ["CURRENT_TITLE",        ["current title", "job title", "current role", "current position"]],
  ["YEARS_EXPERIENCE",     ["years of experience", "years experience", "total experience", "how many years"]],

  // EEO / Demographics
  ["GENDER",               ["sex assigned", "sex at birth"]],
  ["GENDER_IDENTITY",      ["gender identity", "gender"]],
  ["RACE",                 ["race", "ethnicity"]],
  ["HISPANIC_LATINO",      ["hispanic", "latino"]],
  ["SEXUAL_ORIENTATION",   ["sexual orientation"]],
  ["VETERAN",              ["veteran", "military"]],
  ["DISABILITY",           ["disability", "disabled"]],

  // Common application questions
  ["SALARY",               ["salary", "compensation expect", "pay range", "total comp", "compensation requirement"]],
  ["START_DATE",            ["start date", "available to start", "earliest start", "when can you start"]],
  ["HOW_HEARD",             ["how did you hear", "how did you find", "how did you learn", "referral source", "source", "hear about"]],
  ["RELOCATE",              ["relocat", "willing to move", "open to relocation"]],
  ["REMOTE_HYBRID",         ["remote", "hybrid", "in-office", "onsite", "work arrangement"]],
  ["PREVIOUSLY_APPLIED",    ["previously applied", "applied before"]],
  ["PREVIOUSLY_EMPLOYED",   ["have you ever worked", "have you ever been employed", "currently work", "employed by"]],
  ["RELATED_TO",            ["related to"]],
  ["NON_COMPETE",           ["non-compete", "post-employment", "restrictive covenant", "bound to"]],
  ["AGE_18",                ["18 years", "of age", "at least 18"]],
  ["CONSENT",               ["consent", "privacy", "acknowledge", "agree"]],
  ["SPOKEN_LANGUAGES",      ["what language", "languages do you speak", "languages spoken", "languages you speak"]],
  ["ADDITIONAL_LANGUAGES",  ["additional language"]],
  ["COVER_LETTER",          ["cover letter"]],
  ["PROGRAMMING_LANGS",     ["programming language", "coding language"]],
  ["LICENSES",              ["license", "certification", "registration", "finra", "series 7"]],
  ["OTHER_PROCESSES",       ["other processes", "hold offers", "other opportunities", "interviewing elsewhere"]],
  ["ANYTHING_ELSE",         ["anything else", "additional information", "anything you'd like"]],
  ["CHAMPION",              ["champion", "referrer", "referred by"]],
];

// ── Layer 2: Value Map ──
// Maps canonical field name -> value or function(profile) -> value.
// For combobox fields, returns the value to search for in the dropdown.

function buildValueMap(profile) {
  return {
    // Identity
    FIRST_NAME:            profile.firstName,
    PREFERRED_FIRST_NAME:  profile.preferredFirstName,
    LEGAL_FIRST_NAME:      profile.legalFirstName,
    LAST_NAME:             profile.lastName,
    LEGAL_LAST_NAME:       profile.legalLastName,
    FULL_NAME:             profile.fullName,
    EMAIL:                 profile.email,
    PHONE:                 profile.phone,
    LINKEDIN:              profile.linkedIn,
    GITHUB:                "",
    WEBSITE:               profile.linkedIn,

    // Location
    LOCATION_CITY:         profile.city,
    LOCATION:              profile.location,
    COUNTRY:               profile.country,
    STATE:                 profile.state,
    ADDRESS:               profile.address,
    ZIP_CODE:              profile.zip,

    // Work auth (combobox: "Yes" / "No")
    AUTHORIZED_TO_WORK:    profile.authorizedToWork ? "Yes" : "No",
    REQUIRES_SPONSORSHIP:  profile.requiresSponsorship ? "Yes" : "No",

    // Education
    SCHOOL:                profile.school,
    DEGREE:                profile.degree,
    DISCIPLINE:            profile.discipline,
    GPA:                   `${profile.gpa} / 4.0`,
    GRADUATION_MONTH:      profile.graduationMonth,
    GRADUATION_YEAR:       profile.graduationYear,
    HAS_BACHELORS:         profile.hasBachelorsDegree ? "Yes" : "No",
    ENROLLED_MBA:          profile.enrolledInMBA ? "Yes" : "No",
    STANDARDIZED_TESTS:    profile.standardizedTestScores,

    // Employment
    CURRENT_EMPLOYER:      profile.employer,
    CURRENT_TITLE:         profile.jobTitle,
    YEARS_EXPERIENCE:      profile.yearsExperience,

    // EEO
    GENDER:                profile.gender,
    GENDER_IDENTITY:       profile.gender,
    RACE:                  profile.race,
    HISPANIC_LATINO:       profile.hispanicLatino,
    SEXUAL_ORIENTATION:    profile.sexualOrientation,
    VETERAN:               profile.veteranStatus,
    DISABILITY:            profile.disability,

    // Common questions
    SALARY:                profile.salaryExpectation,
    START_DATE:            profile.startDate,
    HOW_HEARD:             profile.howDidYouHear,
    RELOCATE:              profile.relocateDetails,
    REMOTE_HYBRID:         "Flexible, prefer hybrid",
    PREVIOUSLY_APPLIED:    "No",
    PREVIOUSLY_EMPLOYED:   "No",
    RELATED_TO:            "No",
    NON_COMPETE:           "No",
    NOTICE_PERIOD:         profile.noticePeriod === "None" ? "No" : (profile.noticePeriodDetails || "No"),
    AGE_18:                "Yes",
    CONSENT:               "Yes",
    SPOKEN_LANGUAGES:      profile.spokenLanguagesStr,
    ADDITIONAL_LANGUAGES:  "Hindi",
    COVER_LETTER:          "",
    PROGRAMMING_LANGS:     profile.programmingLanguages,
    LICENSES:              profile.hasLicenses ? "Yes" : "No",
    WHY_INTERESTED:        `I am drawn to this opportunity because it aligns with my background in investment analysis, financial modeling, and M&A at Ironhold Capital and Vertex Partners. I am eager to apply my analytical skills and Columbia MS in Applied Analytics in a dynamic team environment.`,
    OTHER_PROCESSES:       "Currently exploring opportunities in investment banking and finance.",
    ANYTHING_ELSE:         "",
    CHAMPION:              "N/A",
  };
}

// ── Layer 1 resolver ──

function resolveCanonical(label) {
  const lower = label.toLowerCase();
  for (const [name, patterns] of FIELD_MAP) {
    if (patterns.some(p => lower.includes(p))) return name;
  }
  return null;
}

// ── Layer 3: LLM Fallback via local Ollama ──

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "devstral-small-2";

const LLM_SYSTEM = `You are filling out a job application form for a candidate. Your job is to provide the correct answer for each form field.

Rules:
- Answer based ONLY on the candidate profile provided
- If the field is a dropdown/combobox with options, you MUST pick from the available options list — return the EXACT option text
- Return ONLY the answer value with no explanation, quotes, or extra text
- For yes/no questions about qualifications the candidate DOES have, answer "Yes"
- For yes/no questions about qualifications the candidate does NOT have, answer "No"
- For questions asking about location/office preference, pick the option closest to New York
- For demographic/EEO questions, use the candidate's stated preferences
- For questions you truly cannot answer from the profile, return "N/A"
- Keep text answers concise (under 30 words)`;

async function askLLM(label, fieldType, options, profile) {
  // Build a compact profile summary
  const profileSummary = {
    name: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    school: `${profile.school} - ${profile.degree} in ${profile.discipline} (GPA: ${profile.gpa}, Grad: ${profile.graduationMonth} ${profile.graduationYear})`,
    school2: `${profile.school2} - ${profile.degree2} in ${profile.discipline2} (GPA: ${profile.gpa2})`,
    employer: `${profile.employer} - ${profile.jobTitle}`,
    yearsExperience: profile.yearsExperience,
    skills: profile.allSkills,
    languages: profile.spokenLanguagesStr,
    authorizedToWork: profile.authorizedToWork,
    requiresSponsorship: profile.requiresSponsorship,
    gender: profile.gender,
    race: profile.race,
    veteranStatus: profile.veteranStatus,
    disability: profile.disability,
    startDate: profile.startDate,
    hasBachelorsDegree: profile.hasBachelorsDegree,
    bachelorsDegreeField: profile.bachelorsDegreeField,
    enrolledInMBA: profile.enrolledInMBA,
    hasNonCompete: profile.hasNonCompete,
    standardizedTestScores: profile.standardizedTestScores,
  };

  let userPrompt = `Candidate: ${JSON.stringify(profileSummary)}\n\nForm field: "${label}"\nType: ${fieldType}`;
  if (options && options.length > 0) {
    userPrompt += `\nAvailable options: ${JSON.stringify(options)}`;
  }
  userPrompt += "\n\nAnswer:";

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: LLM_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 100 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    const answer = (data.message?.content || "").trim().replace(/^["']|["']$/g, "");
    return answer || null;
  } catch (err) {
    console.error(`    [LLM error] ${err.message}`);
    return null;
  }
}

// ── Public API ──

/**
 * Resolve the answer for a form field.
 *
 * @param {string} label - The field label text
 * @param {"text"|"combobox"|"textarea"|"checkbox"} fieldType - Type of form field
 * @param {string[]|null} options - Available dropdown options (for combobox fields)
 * @param {object} profile - Candidate profile object
 * @param {object} opts - Options: { useLLM: boolean }
 * @returns {Promise<{ value: string|null, source: "heuristic"|"llm"|"none", canonical: string|null }>}
 */
export async function resolveField(label, fieldType, options, profile, opts = {}) {
  const useLLM = opts.useLLM !== false; // default true

  // Layer 1: Canonical name lookup
  const canonical = resolveCanonical(label);

  // Layer 2: Value from profile
  if (canonical) {
    const valueMap = buildValueMap(profile);
    const value = valueMap[canonical];
    if (value !== undefined && value !== null) {
      return { value: String(value), source: "heuristic", canonical };
    }
  }

  // Layer 3: LLM fallback
  if (useLLM) {
    const llmAnswer = await askLLM(label, fieldType, options, profile);
    if (llmAnswer) {
      return { value: llmAnswer, source: "llm", canonical };
    }
  }

  return { value: null, source: "none", canonical };
}

/**
 * Combobox synonym expansion table.
 * Given a target value, returns an array of alternative strings to try matching.
 */
export const SYNONYMS = {
  "united states":     ["United States", "USA", "US", "United States of America"],
  "yes":               ["Yes", "True", "Y"],
  "no":                ["No", "False", "N/A", "I don't wish to answer"],
  "decline":           ["Decline", "Decline To Self Identify", "Decline to self-identify", "Prefer not", "I don't wish", "Do not wish", "Choose not", "Decline to Self-Identify", "I don't wish to answer"],
  "female":            ["Female", "Woman", "Cisgender Female", "F"],
  "male":              ["Male", "Man", "Cisgender Male", "M"],
  "asian":             ["Asian", "Asian (Not Hispanic or Latino)", "Asian or Pacific Islander"],
  "straight":          ["Straight", "Heterosexual", "Straight (Heterosexual)"],
  "master of science": ["Master of Science", "Master's Degree", "Master's", "Masters", "MS", "MA", "M.S."],
  "bachelor of science": ["Bachelor of Science", "Bachelor's Degree", "Bachelor's", "Bachelors", "BS", "BA", "B.S."],
  "hindi":             ["Hindi", "Other"],
  "english":           ["English"],
  "september":         ["September", "Sep", "09"],
  "may":               ["May", "05"],
  "new york":          ["New York", "New York, NY", "New York City", "NYC", "NY"],
  "company website":   ["Company website", "Website", "Job Board", "Online", "Other"],
  "immediately":       ["Immediately", "ASAP", "Right away", "2 weeks", "Within 2 weeks"],
  "n/a":               ["N/A", "Not applicable", "None", "NA"],
  "i am not a veteran": ["I am not a Veteran or active member of the military", "I am not a protected veteran", "Not a veteran", "No", "I don't wish to answer"],
};

/**
 * Get synonym candidates for a value.
 */
export function getSynonyms(value) {
  if (!value) return [value];
  const key = value.toLowerCase();
  const syns = SYNONYMS[key];
  return syns ? [value, ...syns] : [value];
}
