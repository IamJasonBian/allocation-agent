/**
 * Source registry — maps ats name → fetcher module.
 *
 * Adding a new ATS means:
 *   1. write src/sources/{ats}.mjs exporting fetchBoard + ATS + HOST
 *   2. register it here
 *   3. seed companies in src/config/companies.json with ats="{ats}"
 */

import * as greenhouse from "./greenhouse.mjs";
import * as lever from "./lever.mjs";
import * as ashby from "./ashby.mjs";
import * as workable from "./workable.mjs";

export const SOURCES = {
  [greenhouse.ATS]: greenhouse,
  [lever.ATS]: lever,
  [ashby.ATS]: ashby,
  [workable.ATS]: workable,
};

export function sourceFor(ats) {
  const s = SOURCES[ats];
  if (!s) throw new Error(`unknown ATS "${ats}" — expected one of ${Object.keys(SOURCES).join(", ")}`);
  return s;
}
