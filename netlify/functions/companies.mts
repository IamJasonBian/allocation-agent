import type { Config } from "@netlify/functions";
import { companies } from "../../src/config/companies.js";

/**
 * GET /api/companies
 * Returns all tracked companies with their Greenhouse URLs.
 */
export default async (req: Request) => {
  const companyList = companies.map((c) => ({
    boardToken: c.boardToken,
    displayName: c.displayName,
    description: c.description,
    greenhouseApiUrl: `https://boards-api.greenhouse.io/v1/boards/${c.boardToken}/jobs`,
    careerPageUrl: `https://boards.greenhouse.io/${c.boardToken}`,
  }));

  return new Response(
    JSON.stringify({ count: companyList.length, companies: companyList }, null, 2),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const config: Config = {
  path: "/api/companies",
};
