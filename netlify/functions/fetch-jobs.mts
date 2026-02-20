import type { Config } from "@netlify/functions";

/**
 * Scheduled function — runs on a cron schedule.
 * Fires a POST to the background worker function, which has a 15-min timeout.
 */
export default async (req: Request) => {
  const siteUrl = process.env.URL || "http://localhost:8888";
  const secret = process.env.INTERNAL_WEBHOOK_SECRET || "";

  try {
    await fetch(`${siteUrl}/.netlify/functions/fetch-jobs-worker-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({ triggered_at: new Date().toISOString() }),
    });
    console.log("Background worker triggered");
  } catch (error) {
    console.error("Failed to trigger background worker:", error);
  }
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
