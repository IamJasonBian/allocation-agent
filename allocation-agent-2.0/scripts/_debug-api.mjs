import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserWSEndpoint: (await (await fetch("http://127.0.0.1:9222/json/version")).json()).webSocketDebuggerUrl,
});
const page = await browser.newPage();

// Navigate to get cookies
await page.goto("https://www.1point3acres.com/interview/sde", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));

// Intercept the actual TRPC call
const intercepted = [];
page.on("response", async (resp) => {
  if (resp.url().includes("getInterviewThreadList")) {
    try {
      const body = await resp.json();
      intercepted.push(body);
      console.log("=== Intercepted TRPC response ===");
      console.log(JSON.stringify(body, null, 2).slice(0, 5000));
    } catch {}
  }
});

// Trigger a reload to capture the API call
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));

if (intercepted.length === 0) {
  // Try calling directly
  const input = JSON.stringify({
    "0": { json: { fid: 145, company: "", filters: {}, page: 1, lastDateline: 0 } },
  });
  const url = `https://trpc.1point3acres.com/trpc/interview.getInterviewThreadList?batch=1&input=${encodeURIComponent(input)}`;
  const result = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "include" });
    return { status: r.status, text: await r.text() };
  }, url);
  console.log("=== Direct API call ===");
  console.log("Status:", result.status);
  console.log(result.text.slice(0, 5000));
}

await page.close();
browser.disconnect();
