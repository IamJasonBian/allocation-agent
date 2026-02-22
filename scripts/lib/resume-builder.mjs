/**
 * Dynamic resume PDF builder using pdfkit.
 * Reorders skills in TECH SKILLS section to prioritize JD-matched skills.
 * Adds a RELEVANT TECHNOLOGIES section for niche/specialized JD tech.
 */

import { createWriteStream } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { flattenStack } from "./jd-parser.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build a tailored resume PDF.
 * @param {string} resumeText - Plain text resume
 * @param {string[]} candidateSkills - Candidate skill keywords
 * @param {{ languages: string[], frameworks: string[], databases: string[], cloud: string[], tools: string[], niche?: string[] }} jdStack - Parsed JD tech stack
 * @returns {Promise<{ path: string, matchedSkills: string[], nicheTech: string[] }>}
 */
export async function buildResume(resumeText, candidateSkills, jdStack) {
  const allJdSkills = flattenStack(jdStack);
  const nicheTech = jdStack.niche || [];

  // --- Match candidate skills against JD stack (fuzzy: includes in either direction) ---
  const matchedSkills = candidateSkills.filter((cs) => {
    const csLow = cs.toLowerCase();
    return allJdSkills.some((jd) => {
      const jdLow = jd.toLowerCase();
      return csLow.includes(jdLow) || jdLow.includes(csLow);
    });
  });

  // --- Parse resume into sections ---
  const lines = resumeText.split("\n");
  const sections = [];
  let currentSection = { heading: "HEADER", lines: [] };

  const SECTION_HEADINGS = ["PROFESSIONAL EXPERIENCE", "TECH SKILLS", "EDUCATION"];

  for (const line of lines) {
    const trimmed = line.trim();
    if (SECTION_HEADINGS.includes(trimmed)) {
      sections.push(currentSection);
      currentSection = { heading: trimmed, lines: [] };
    } else {
      currentSection.lines.push(line);
    }
  }
  sections.push(currentSection);

  // --- Reorder TECH SKILLS section ---
  const matchedLower = new Set(matchedSkills.map((s) => s.toLowerCase()));
  const jdLower = new Set(allJdSkills.map((s) => s.toLowerCase()));

  for (const section of sections) {
    if (section.heading !== "TECH SKILLS") continue;

    section.lines = section.lines.map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) return line;

      const prefix = line.slice(0, colonIdx + 1);
      const rest = line.slice(colonIdx + 1).trim();
      if (!rest) return line;

      // Parse items, respecting parenthetical groups like "Python (airflow, pytorch, django)"
      const items = [];
      let current = "";
      let depth = 0;
      for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          items.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      if (current.trim()) items.push(current.trim());

      // Partition into matched and unmatched
      const matched = [];
      const unmatched = [];
      for (const item of items) {
        const itemLow = item.toLowerCase();
        const isMatch =
          matchedLower.has(itemLow) ||
          jdLower.has(itemLow) ||
          [...matchedLower].some((m) => itemLow.includes(m)) ||
          [...jdLower].some((j) => itemLow.includes(j));
        if (isMatch) {
          matched.push(item);
        } else {
          unmatched.push(item);
        }
      }

      return `${prefix} ${[...matched, ...unmatched].join(", ")}`;
    });
  }

  // --- Inject RELEVANT TECHNOLOGIES section before EDUCATION ---
  if (nicheTech.length > 0) {
    const eduIdx = sections.findIndex((s) => s.heading === "EDUCATION");
    const nicheSection = {
      heading: "RELEVANT TECHNOLOGIES",
      lines: [`JD Stack: ${nicheTech.join(", ")}`],
    };
    if (eduIdx >= 0) {
      sections.splice(eduIdx, 0, nicheSection);
    } else {
      sections.push(nicheSection);
    }
  }

  // --- Generate PDF ---
  const outPath = resolve(__dirname, "..", "..", "blob", "resume_tmp.pdf");
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 45, bottom: 45, left: 55, right: 55 } });

  const stream = createWriteStream(outPath);
  doc.pipe(stream);

  for (const section of sections) {
    if (section.heading === "HEADER") {
      // First non-empty line is the name
      const nameIdx = section.lines.findIndex((l) => l.trim().length > 0);
      if (nameIdx >= 0) {
        doc.font("Helvetica-Bold").fontSize(16).text(section.lines[nameIdx].trim(), { align: "center" });
      }
      // Remaining header lines are contact info
      for (let i = nameIdx + 1; i < section.lines.length; i++) {
        const t = section.lines[i].trim();
        if (t) {
          doc.font("Helvetica").fontSize(9).text(t, { align: "center" });
        }
      }
      doc.moveDown(0.3);
    } else {
      // Section heading with horizontal rule
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(11).text(section.heading);
      const y = doc.y;
      doc.moveTo(55, y).lineTo(557, y).lineWidth(0.5).stroke();
      doc.moveDown(0.2);

      for (const line of section.lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes("\u2014")) {
          // Company/role line (contains em dash)
          doc.font("Helvetica-Bold").fontSize(9.5).text(trimmed);
        } else if (trimmed.startsWith("\u2022")) {
          // Bullet point
          doc.font("Helvetica").fontSize(9.5).text(trimmed, { indent: 10 });
        } else if (trimmed.length < 80 && !trimmed.includes(":")) {
          // Short line without bullet or colon → sub-header
          doc.font("Helvetica-Oblique").fontSize(9.5).text(trimmed);
        } else {
          // Body text
          doc.font("Helvetica").fontSize(9.5).text(trimmed);
        }
      }
    }
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { path: outPath, matchedSkills, nicheTech };
}
