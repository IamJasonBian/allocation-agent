import type { Config } from "@netlify/functions";
import { companies } from "../../src/config/companies.js";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * GET /api/status
 * Returns last fetch times and job counts for each tracked company.
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const statuses = await Promise.all(
      companies.map(async (c) => {
        const lastFetch = await redis.get(`meta:last_fetch:${c.boardToken}`);
        const stats = await redis.hgetall(`stats:company:${c.boardToken}`);
        return {
          company: c.displayName,
          boardToken: c.boardToken,
          lastFetch: lastFetch || null,
          activeJobs: stats.active || "0",
          totalSeen: stats.total_seen || "0",
          lastNew: stats.last_new || "0",
          lastRemoved: stats.last_removed || "0",
        };
      }),
    );

    return new Response(JSON.stringify({ statuses }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/status",
};
