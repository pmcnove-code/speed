/** Local-page smoke check: no Google requests, credentials, or paid generation. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, stealthEnabled } from "./browser.mjs";

const options = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], locale: "en-US" };
const profile = await mkdtemp(join(tmpdir(), "flow-browser-smoke-"));
async function check(context, mode) {
  const page = await context.newPage();
  await page.goto("data:text/html,<title>Flow browser check</title><p>Ready</p>");
  const result = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    userAgent: navigator.userAgent,
    languages: [...navigator.languages],
    plugins: navigator.plugins.length,
  }));
  if (stealthEnabled()) {
    assert.notEqual(result.webdriver, true);
    assert.doesNotMatch(result.userAgent, /HeadlessChrome/);
    assert.ok(result.plugins > 0);
  }
  assert.ok(result.languages.includes("en-US"));
  console.log(JSON.stringify({ mode, stealth: stealthEnabled(), ...result }));
}
try {
  const browser = await chromium.launch(options);
  try { await check(await browser.newContext({ locale: "en-US" }), "ephemeral"); }
  finally { await browser.close(); }
  const context = await chromium.launchPersistentContext(profile, options);
  try { await check(context, "persistent"); }
  finally { await context.close(); }
} finally { await rm(profile, { recursive: true, force: true }); }
