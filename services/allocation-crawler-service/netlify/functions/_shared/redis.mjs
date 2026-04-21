/**
 * Lazy, per-function-invocation Redis client. Reused across the Netlify
 * functions in this service so we don't open a fresh TCP connection on every
 * request.
 */

import IORedis from "ioredis";

let client = null;

export function getRedis() {
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

export function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function readUserId(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  return id ? decodeURIComponent(id) : null;
}
