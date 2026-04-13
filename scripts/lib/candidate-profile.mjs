/**
 * Candidate profile loader.
 *
 * Loads a candidate profile by name from:
 *   scripts/lib/candidate-profile-{name}.mjs
 *
 * Usage:
 *   const profile = await loadProfile("aastha");
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_FIELDS = [
  "firstName", "lastName", "email", "phone", "resumePath",
  "school", "degree", "discipline", "graduationYear",
];

/**
 * Load a candidate profile by name.
 * Looks for scripts/lib/candidate-profile-{name}.mjs
 *
 * @param {string} name - Candidate name (e.g., "aastha")
 * @returns {Promise<object>} The profile object
 */
export async function loadProfile(name) {
  const profilePath = resolve(__dirname, `candidate-profile-${name}.mjs`);
  if (!existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  const mod = await import(profilePath);
  const profile = mod.profile || mod.default;
  if (!profile) {
    throw new Error(`Profile module must export 'profile' or 'default': ${profilePath}`);
  }
  validateProfile(profile, name);
  return profile;
}

/**
 * Validate that a profile has all required fields.
 * Throws if any required field is missing.
 */
export function validateProfile(profile, name = "unknown") {
  const missing = REQUIRED_FIELDS.filter(f => !profile[f] && profile[f] !== false);
  if (missing.length > 0) {
    throw new Error(`Profile "${name}" missing required fields: ${missing.join(", ")}`);
  }
}

/**
 * List available candidate profile names.
 */
export function listProfiles() {
  return readdirSync(__dirname)
    .filter(f => f.startsWith("candidate-profile-") && f.endsWith(".mjs"))
    .map(f => f.replace("candidate-profile-", "").replace(".mjs", ""));
}
