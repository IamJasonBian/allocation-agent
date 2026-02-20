import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * GET /api/applications
 * Query stored application records from Netlify Blobs.
 *
 * Query params:
 *   ?company=jumptrading   — filter by board token
 *   ?status=confirmed       — filter by stepReached (confirmed, failed, submitted)
 */
export default async (req: Request) => {
  const url = new URL(req.url);
  const companyFilter = url.searchParams.get("company");
  const statusFilter = url.searchParams.get("status");

  try {
    const store = getStore({ name: "applications", siteID: process.env.SITE_ID || "" });

    const listOpts: { prefix?: string } = {};
    if (companyFilter) listOpts.prefix = `${companyFilter}/`;

    const { blobs } = await store.list(listOpts);

    // Only fetch metadata.json entries
    const metadataKeys = blobs
      .filter((b) => b.key.endsWith("/metadata.json"))
      .map((b) => b.key);

    const records = await Promise.all(
      metadataKeys.map(async (key) => {
        try {
          const data = await store.get(key, { type: "json" });
          return data;
        } catch {
          return null;
        }
      })
    );

    let filtered = records.filter(Boolean) as any[];

    if (statusFilter) {
      filtered = filtered.filter((r) => r.metadata?.stepReached === statusFilter);
    }

    return new Response(
      JSON.stringify({ count: filtered.length, applications: filtered }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/applications",
};
