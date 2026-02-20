import type { GreenhouseJob, GreenhouseResponse } from "./types.js";

const BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export async function fetchGreenhouseJobs(boardToken: string): Promise<GreenhouseJob[]> {
  const url = `${BASE_URL}/${boardToken}/jobs?content=true`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`Greenhouse returned ${response.status} for ${boardToken}`);
      return [];
    }

    const data = (await response.json()) as GreenhouseResponse;
    return data.jobs || [];
  } catch (error) {
    console.error(`Failed to fetch ${boardToken}:`, error);
    return [];
  }
}
