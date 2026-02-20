import { companies } from "../../src/config/companies.js";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { fetchGreenhouseJobs } from "../../src/lib/greenhouse.js";
import { diffAndUpdate } from "../../src/lib/differ.js";
import { sendNotificationDigest } from "../../src/lib/notifier.js";
import type { JobNotification } from "../../src/lib/types.js";

/**
 * Background function (15-min timeout).
 * Named with -background suffix so Netlify returns 202 immediately.
 *
 * Processes all tracked companies:
 * 1. Fetches jobs from Greenhouse API
 * 2. Diffs against Redis state
 * 3. Updates Redis indexes
 * 4. Sends SMS digest of new/removed jobs
 */
export default async (req: Request) => {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== (process.env.INTERNAL_WEBHOOK_SECRET || "")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const redis = getRedisClient();
  const allNotifications: JobNotification[] = [];

  try {
    await redis.ping();
    console.log("Redis connected");

    for (const company of companies) {
      console.log(`Processing ${company.displayName} (${company.boardToken})...`);

      const apiJobs = await fetchGreenhouseJobs(company.boardToken);
      if (apiJobs.length === 0) {
        console.log(`  No jobs returned for ${company.boardToken}, skipping`);
        continue;
      }

      const { stats, notifications } = await diffAndUpdate(redis, company, apiJobs);
      allNotifications.push(...notifications);

      console.log(`  ${company.boardToken}: new=${stats.newCount} updated=${stats.updatedCount} removed=${stats.removedCount} unchanged=${stats.unchangedCount}`);

      // Be polite to Greenhouse API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Prune old feed entries (older than 6 months)
    const sixMonthsAgo = Date.now() / 1000 - 180 * 86400;
    await redis.zremrangebyscore("feed:new", "-inf", sixMonthsAgo);
    await redis.zremrangebyscore("feed:removed", "-inf", sixMonthsAgo);

    // Send SMS digest
    if (allNotifications.length > 0) {
      console.log(`Sending SMS digest with ${allNotifications.length} notifications`);
      await sendNotificationDigest(allNotifications);
    } else {
      console.log("No new notifications to send");
    }

    console.log(`Done. Processed ${companies.length} companies, ${allNotifications.length} notifications`);
  } finally {
    await disconnectRedis();
  }
};
