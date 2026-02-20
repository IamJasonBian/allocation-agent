const LOCATION_MAP: Record<string, string> = {
  "new york": "new_york",
  "nyc": "new_york",
  "ny": "new_york",
  "chicago": "chicago",
  "il": "chicago",
  "london": "london",
  "uk": "london",
  "san francisco": "san_francisco",
  "sf": "san_francisco",
  "remote": "remote",
};

export function normalizeLocation(location: string): string {
  const loc = location.toLowerCase().trim();
  for (const [pattern, normalized] of Object.entries(LOCATION_MAP)) {
    if (loc.includes(pattern)) return normalized;
  }
  return loc.replace(/\s+/g, "_").replace(/,/g, "").replace(/^_|_$/g, "");
}

export function normalizeDepartment(department: string): string {
  return department.toLowerCase().replace(/\s+/g, "_").replace(/&/g, "and");
}
