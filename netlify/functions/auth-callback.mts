import type { Context } from "@netlify/functions";
import { exchangeCodeForTokens } from "../../src/lib/gmail.js";

/**
 * GET /api/auth/callback
 *
 * Receives the OAuth authorization code from Google,
 * exchanges it for tokens, and displays them.
 *
 * The refresh_token should be saved as GOOGLE_REFRESH_TOKEN env var.
 */
export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  try {
    const redirectUri = `${url.origin}/api/auth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Return tokens - the user should save refresh_token as env var
    const html = `<!DOCTYPE html>
<html><head><title>OAuth Success</title></head>
<body style="font-family: monospace; max-width: 600px; margin: 40px auto; padding: 20px;">
<h2>OAuth Tokens Received</h2>
<p><strong>Access Token:</strong></p>
<textarea readonly rows="3" style="width:100%">${tokens.access_token}</textarea>
<p><strong>Refresh Token:</strong> (save this as GOOGLE_REFRESH_TOKEN env var)</p>
<textarea readonly rows="3" style="width:100%">${tokens.refresh_token || "NOT PROVIDED - try revoking and re-authing"}</textarea>
<p><strong>Expires In:</strong> ${tokens.expires_in}s</p>
<p>Run: <code>netlify env:set GOOGLE_REFRESH_TOKEN ${tokens.refresh_token || "YOUR_TOKEN"}</code></p>
</body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    return new Response(
      `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }
};
