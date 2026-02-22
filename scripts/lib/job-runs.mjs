/**
 * JobRuns Redis entity for tracking applications with resume/skill metadata.
 */

import Redis from "ioredis";

const TTL_90_DAYS = 90 * 24 * 60 * 60;

let redis;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || "redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com",
      port: parseInt(process.env.REDIS_PORT || "17054", 10),
      password: process.env.REDIS_PASSWORD,
    });
  }
  return redis;
}

/**
 * Record a job application run.
 * @param {Object} params
 * @param {string} params.platform - Platform name (e.g. "greenhouse", "lever")
 * @param {string} params.company - Company slug
 * @param {string} params.jobId - Job posting ID
 * @param {string} params.jobTitle - Job title
 * @param {string} [params.resumeVariant] - Resume variant identifier
 * @param {string[]} [params.resumeSkillsMatched] - Skills matched in resume
 * @param {string[]} [params.jdStackDetected] - Tech stack detected from JD
 * @param {string} params.status - Application status (e.g. "applied", "failed")
 * @param {string} [params.message] - Additional message/error detail
 */
export async function recordJobRun({
  platform,
  company,
  jobId,
  jobTitle,
  resumeVariant,
  resumeSkillsMatched,
  jdStackDetected,
  status,
  message,
}) {
  const r = getRedis();
  const key = `job_runs:${platform}:${company}:${jobId}`;
  const now = Date.now();

  const record = {
    platform,
    company,
    jobId,
    jobTitle,
    resumeVariant: resumeVariant || null,
    resumeSkillsMatched: resumeSkillsMatched || [],
    jdStackDetected: jdStackDetected || [],
    status,
    message: message || null,
    appliedAt: new Date(now).toISOString(),
  };

  await r.set(key, JSON.stringify(record), "EX", TTL_90_DAYS);
  await r.zadd("job_runs:index", now, key);
}

/**
 * Get a job run record.
 * @param {string} platform
 * @param {string} company
 * @param {string} jobId
 * @returns {Promise<Object|null>} Parsed record or null
 */
export async function getJobRun(platform, company, jobId) {
  const r = getRedis();
  const key = `job_runs:${platform}:${company}:${jobId}`;
  const raw = await r.get(key);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Disconnect the Redis client.
 */
export async function disconnectJobRuns() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
