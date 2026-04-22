import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "../nanoorch-e2e-flow.png");
const URL = "http://localhost:23636/__mockup/preview/nanoorch-e2e-flow/NanoOrchE2EFlow";

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1800, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });

  // wait for fonts + animations to settle
  await new Promise(r => setTimeout(r, 2000));

  // measure full content height
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ width: 1500, height: Math.max(height, 1800), deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: OUTPUT, fullPage: true });
  console.log(`Saved: ${OUTPUT} (height=${height}px)`);
  await browser.close();
})();
