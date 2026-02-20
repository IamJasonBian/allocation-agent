import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { companies } from "../../src/config/companies.js";
import { candidate } from "../../src/config/candidate.js";

/**
 * GET /api/bot-status
 * Returns operational health and config summary for the auto-apply bot.
 */
export default async (req: Request) => {
  // Check Gmail OAuth config
  const gmail = {
    clientId: !!process.env.GOOGLE_CLIENT_ID,
    clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
  };

  // Check blob store + recent applications
  let blobStatus = { connected: false, totalRecords: 0, lastApplication: null as string | null };
  try {
    const store = getStore({ name: "applications", siteID: process.env.SITE_ID || "" });
    const { blobs } = await store.list();
    const metadataKeys = blobs.filter((b) => b.key.endsWith("/metadata.json"));
    blobStatus.connected = true;
    blobStatus.totalRecords = metadataKeys.length;

    // Get most recent application
    if (metadataKeys.length > 0) {
      const lastKey = metadataKeys[metadataKeys.length - 1].key;
      try {
        const last = (await store.get(lastKey, { type: "json" })) as any;
        blobStatus.lastApplication = last?.metadata?.timestamp || null;
      } catch {}
    }
  } catch {}

  // Application summary from blobs
  let applicationSummary: any[] = [];
  try {
    const store = getStore({ name: "applications", siteID: process.env.SITE_ID || "" });
    const { blobs } = await store.list();
    const metadataKeys = blobs.filter((b) => b.key.endsWith("/metadata.json"));

    const records = await Promise.all(
      metadataKeys.map(async (key) => {
        try {
          return await store.get(key, { type: "json" });
        } catch {
          return null;
        }
      })
    );

    applicationSummary = (records.filter(Boolean) as any[]).map((r) => ({
      company: r.metadata?.companyName,
      jobId: r.metadata?.jobId,
      status: r.metadata?.stepReached,
      success: r.metadata?.success,
      timestamp: r.metadata?.timestamp,
    }));
  } catch {}

  return new Response(
    JSON.stringify(
      {
        bot: {
          candidate: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          trackedCompanies: companies.length,
        },
        gmail,
        blobStore: blobStatus,
        applications: applicationSummary,
        companies: companies.map((c) => ({
          boardToken: c.boardToken,
          name: c.displayName,
        })),
      },
      null,
      2
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/bot-status",
};
