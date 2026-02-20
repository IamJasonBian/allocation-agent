import { QUANT_KEYWORDS } from "../config/keywords.js";

export function extractTags(title: string, department: string): Set<string> {
  const tags = new Set<string>();
  const combined = `${title} ${department}`.toLowerCase();

  for (const kw of QUANT_KEYWORDS) {
    if (combined.includes(kw)) {
      tags.add(kw.replace(/\s+/g, "_"));
    }
  }

  if (["engineer", "developer", "software", "swe"].some((w) => combined.includes(w))) tags.add("engineering");
  if (["research", "researcher"].some((w) => combined.includes(w))) tags.add("research");
  if (["analyst", "analysis"].some((w) => combined.includes(w))) tags.add("analyst");
  if (["intern", "internship"].some((w) => combined.includes(w))) tags.add("intern");
  if (["senior", "staff", "principal", "lead"].some((w) => combined.includes(w))) tags.add("senior");
  if (["junior", "associate", "entry"].some((w) => combined.includes(w))) tags.add("junior");
  if (["quant", "quantitative", "trading", "risk", "derivatives", "pricing", "alpha"].some((w) => combined.includes(w))) {
    tags.add("quant");
  }

  return tags;
}
