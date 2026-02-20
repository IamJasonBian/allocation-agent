import type { Context } from "@netlify/functions";
import { getAuthUrl } from "../../src/lib/gmail.js";

/**
 * GET /api/auth/google
 *
 * Redirects to Google OAuth consent page.
 * After consent, Google redirects to /api/auth/callback.
 */
export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const authUrl = getAuthUrl(redirectUri);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
};
