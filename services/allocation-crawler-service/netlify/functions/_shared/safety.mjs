/**
 * Operational safety for POST handlers:
 * - X-Dry-Run: 1 — validate only, no Redis writes
 * - Idempotency-Key — replay identical POSTs without double-write (24h TTL)
 */

import { createHash } from "crypto";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function isDryRun(request) {
  const v = request.headers.get("x-dry-run");
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export function getIdempotencyKey(request) {
  const k = request.headers.get("idempotency-key");
  return k && String(k).trim() ? String(k).trim() : null;
}

export function hashPayload(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function idempotencyRedisKey(scope, userId, idempotencyKey) {
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
  return `idempotency_post:${scope}:${userId}:${keyHash}`;
}

/**
 * @param {object} opts
 * @param {import("ioredis").Redis} opts.redis
 * @param {string} opts.scope short name e.g. "candidates" | "history"
 * @param {string} opts.userId
 * @param {string|null} opts.idempotencyKey
 * @param {object} opts.normalizedBody validated payload to hash (must be stable)
 * @param {() => Promise<{ status: number, body: object }>} opts.executeWrite
 */
export async function executePostWithIdempotency({
  redis,
  scope,
  userId,
  idempotencyKey,
  normalizedBody,
  executeWrite,
}) {
  const bodyHash = hashPayload(normalizedBody);

  if (!idempotencyKey) {
    const { status, body } = await executeWrite();
    return jsonResponse(status, body);
  }

  const redisKey = idempotencyRedisKey(scope, userId, idempotencyKey);
  const cached = await redis.get(redisKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.bodyHash !== bodyHash) {
        return jsonResponse(409, {
          error: "idempotency key mismatch",
          detail: "request body differs from the first request with this Idempotency-Key",
        });
      }
      return jsonResponse(parsed.status, parsed.body, { "Idempotent-Replayed": "true" });
    } catch {
      // fall through to fresh write
    }
  }

  const { status, body } = await executeWrite();
  if (status >= 200 && status < 300) {
    await redis.set(
      redisKey,
      JSON.stringify({ status, body, bodyHash }),
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
    );
  }
  return jsonResponse(status, body);
}

export { IDEMPOTENCY_TTL_SECONDS };
