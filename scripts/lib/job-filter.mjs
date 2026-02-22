/**
 * Shared job relevancy filter.
 * Consolidated keyword lists from Dover filter (most comprehensive).
 */

export const INCLUDE_KEYWORDS = [
  "software", "engineer", "developer", "data", "machine learning", "ml ",
  "backend", "back-end", "full stack", "full-stack", "fullstack",
  "infrastructure", "platform", "devops", "sre", "reliability",
  "quantitative", "quant", "analyst", "scientist",
  "python", "java", "cloud", "systems",
  "founding", "frontend", "front-end", "mobile", "ios", "android",
  "architect", "tech lead", "technical lead", "head of engineering",
  "ai ", "robotics", "automation", "security", "cyber",
  "product engineer", "implementation engineer",
];

export const EXCLUDE_KEYWORDS = [
  "intern", "recruiter", "recruiting", "human resources",
  "sales", "marketing", "design", "product manager",
  "account manager", "account executive", "partnership manager",
  "clinical", "nurse", "medical", "pharmacist",
  "customer success", "customer support",
  "executive assistant", "office manager",
  "content", "copywriter", "pr ", "public relations",
  "legal", "paralegal", "attorney", "counsel",
  "accountant", "bookkeeper", "controller", "compliance",
  "solutions consultant", "gtm", "treasury", "fp&a",
];

export const NON_US_LOCATIONS = [
  "international", "brazil", "europe", "india", "nigeria", "australia",
  "london", "uk", "berlin", "germany", "toronto", "canada",
  "singapore", "hong kong", "japan", "korea", "south africa", "africa",
  "remote (international", "latin america", "latam", "mexico",
  "philippines", "pakistan", "bangladesh", "vietnam",
  "tel aviv", "israel", "dubai", "lithuania", "spain", "romania",
  "portugal", "poland", "armenia", "taiwan", "china", "france", "paris",
  "nantong", "xiamen", "guangzhou", "hangzhou", "taipei", "shanghai", "beijing",
  "netherlands", "amsterdam", "ireland", "dublin",
  "sweden", "stockholm", "denmark", "norway", "finland",
  "switzerland", "zurich", "austria", "vienna",
  "czech", "prague", "hungary", "budapest",
  "argentina", "buenos aires", "colombia", "bogota",
  "chile", "santiago", "peru", "lima",
];

/**
 * Determine whether a job posting is relevant based on title, location, team.
 * @param {string} title  - Job title
 * @param {string} location - Job location
 * @param {string} team - Job team/department (optional)
 * @returns {boolean}
 */
export function isRelevantJob(title, location = "", team = "") {
  const t = (title || "").toLowerCase();
  const l = (location || "").toLowerCase();
  const m = (team || "").toLowerCase();

  // 1. Exclude by title or team
  if (EXCLUDE_KEYWORDS.some((kw) => t.includes(kw) || m.includes(kw))) {
    return false;
  }

  // 2. Must match at least one include keyword in title or team
  if (!INCLUDE_KEYWORDS.some((kw) => t.includes(kw) || m.includes(kw))) {
    return false;
  }

  // 3. Exclude non-US locations (check title and location)
  if (NON_US_LOCATIONS.some((kw) => t.includes(kw) || l.includes(kw))) {
    return false;
  }

  return true;
}
