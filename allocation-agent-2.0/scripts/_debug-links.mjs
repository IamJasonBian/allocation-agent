import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserWSEndpoint: (await (await fetch("http://127.0.0.1:9222/json/version")).json()).webSocketDebuggerUrl,
});
const page = await browser.newPage();

const apiUrls = [];
page.on("request", (req) => {
  const url = req.url();
  if (url.includes(".js") || url.includes(".css") || url.includes("sentry")) return;
  if (url.includes("api") || url.includes("thread") || url.includes("post") || url.includes("interview")) {
    apiUrls.push({ method: req.method(), url });
  }
});

await page.goto("https://www.1point3acres.com/interview/sde", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));

console.log("=== Initial API calls ===");
apiUrls.forEach((u) => console.log(u.method, u.url));
apiUrls.length = 0;

// Click first post
const clicked = await page.evaluate(() => {
  const card = document.querySelector('[data-sentry-component="InterviewThreadItem"]');
  if (card) { card.click(); return true; }
  return false;
});
console.log("\nClicked:", clicked);
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== After click API calls ===");
apiUrls.forEach((u) => console.log(u.method, u.url));

console.log("\n=== Current URL ===");
console.log(page.url());

await page.close();
browser.disconnect();
