/**
 * Structured candidate profile for Aastha Aggarwal.
 * Single source of truth — used by field-resolver and batch apply scripts.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const profile = {
  // Identity
  firstName: "Aastha",
  lastName: "Aggarwal",
  fullName: "Aastha Aggarwal",
  preferredFirstName: "Aastha",
  legalFirstName: "Aastha",
  legalLastName: "Aggarwal",
  email: "aastha.aggarwal1@gmail.com",
  phone: "347-224-9624",
  phoneRaw: "3472249624",
  linkedIn: "https://www.linkedin.com/in/aastar",

  // Location
  city: "New York",
  state: "New York",
  stateAbbrev: "NY",
  zip: "10001",
  country: "United States",
  location: "New York, NY",
  address: "New York, NY 10001",
  willingToRelocate: true,
  relocateDetails: "Based in New York, open to relocation",

  // Work authorization
  authorizedToWork: true,  // currently authorized (OPT), but needs future sponsorship
  requiresSponsorship: true,

  // Education (primary)
  school: "Columbia University",
  degree: "Master of Science",
  degreeShort: "MS",
  discipline: "Applied Analytics",
  gpa: "3.6",
  graduationMonth: "May",
  graduationYear: "2025",
  eduStartMonth: "September",
  eduStartYear: "2023",
  enrolledInMBA: false,

  // Education (secondary)
  school2: "Fordham University Gabelli School of Business",
  degree2: "Bachelor of Science",
  discipline2: "Global Business",
  gpa2: "3.9",
  hasBachelorsDegree: true,
  bachelorsDegreeField: "Global Business",

  // Employment
  employer: "Ironhold Capital",
  jobTitle: "Investment Analyst",
  yearsExperience: "3",
  empStartMonth: "06",
  empStartYear: "2022",
  empEndMonth: "08",
  empEndYear: "2023",

  // EEO / Demographics
  gender: "Female",
  race: "Asian",
  hispanicLatino: "No",
  sexualOrientation: "Straight",
  veteranStatus: "No",
  disability: "No",

  // Skills & languages
  programmingLanguages: "Python, R, Java, SQL, Excel",
  spokenLanguages: ["English", "Hindi"],
  spokenLanguagesStr: "English, Hindi",
  analyticsTools: "Tableau, PowerPoint, Alexa Analytics",
  financeSkills: "Equity Research, M&A, Financial Modeling, NAV Techniques, DCF Valuation",
  mlSkills: "Supervised Learning, Unsupervised Learning, LLM, Predictive Analytics, Linear Regression, Decision Trees",
  allSkills: "Python, R, Java, SQL, Excel, Tableau, Financial Modeling, M&A, DCF Valuation, Predictive Analytics",

  // Availability & restrictions
  startDate: "Immediately",
  noticePeriod: "None",
  hasNonCompete: false,
  noticePeriodDetails: "No non-compete. Available immediately.",

  // Application defaults
  salaryExpectation: "Open to discussion",
  howDidYouHear: "Company website",
  coverLetter: "",

  // Standardized tests
  gmatScore: "",
  actScore: "",
  satScore: "",
  standardizedTestScores: "N/A",

  // Licenses
  hasLicenses: false,
  licensesDetails: "N/A",

  // Resume
  resumePath: resolve(__dirname, "../../blob/aastha_resume.pdf"),
  resumeText: `AASTHA AGGARWAL
New York, NY | 347-224-9624 | aastha.aggarwal1@gmail.com | linkedin.com/in/aastar

EDUCATION
Columbia University, M.S. Applied Analytics — GPA: 3.6
Fordham University Gabelli School of Business, B.S. Global Business — GPA: 3.9

PROFESSIONAL EXPERIENCE

Ironhold Capital — Investment Analyst (Generalist)
- Investment analysis across multiple sectors
- Financial modeling and due diligence

Vertex Partners — M&A Analyst Intern
- M&A deal analysis and financial modeling
- Cash flow projections and valuation

Value Works LLC — Equity Trader
- Equity research and trading
- NAV techniques and DCF valuation

Ecohaven Furniture — Market Research Analytics Intern
- Market research and predictive analytics
- Data-driven insights using Python and Tableau

TECHNICAL SKILLS
Programming: Python, R, Java, SQL, Excel
Analytics Tools: Tableau, PowerPoint, Alexa Analytics
ML/Analytics: Supervised Learning, Unsupervised Learning, LLM, Predictive Analytics
Finance: Equity Research, M&A, Financial Modeling, NAV Techniques, DCF Valuation`,
};
