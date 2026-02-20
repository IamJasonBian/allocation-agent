import type { Context } from "@netlify/functions";
import { refreshAccessToken, fetchGreenhouseSecurityCode } from "../../src/lib/gmail.js";

/**
 * GET /api/check-email
 *
 * Checks Gmail for recent Greenhouse security code emails.
 * Requires GOOGLE_REFRESH_TOKEN env var to be set.
 *
 * Query params:
 *   maxAge - max email age in minutes (default 10)
 */
export default async (req: Request, _ctx: Context) => {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    return new Response(
      JSON.stringify({
        error: "GOOGLE_REFRESH_TOKEN not set. Visit /api/auth/google first.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);

    const url = new URL(req.url);
    const maxAge = parseInt(url.searchParams.get("maxAge") || "10", 10);

    const code = await fetchGreenhouseSecurityCode(accessToken, maxAge);

    return new Response(
      JSON.stringify({
        found: !!code,
        securityCode: code,
        checkedAt: new Date().toISOString(),
        maxAgeMinutes: maxAge,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Gmail check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
