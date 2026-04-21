/**
 * ESM bridge to the shared Redis client.
 *
 * src/lib/redis.ts is the TS original (kept for existing importers). Both
 * the Netlify functions and the .mjs scripts use this wrapper so they all
 * share one connection and one env-var contract.
 */

import IORedis from "ioredis";

let client = null;

export function getRedisClient() {
  if (client) return client;
  client = new IORedis({
    host: process.env.REDIS_HOST || "redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com",
    port: parseInt(process.env.REDIS_PORT || "17054", 10),
    password: process.env.REDIS_PASSWORD || "",
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    commandTimeout: 10000,
  });
  return client;
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}
