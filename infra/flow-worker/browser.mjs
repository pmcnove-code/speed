import { chromium as baseChromium } from "playwright";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

export function stealthEnabled(value = process.env.FLOW_STEALTH) {
  return !/^(0|false|off)$/i.test(String(value ?? "1").trim());
}

export function createChromium({ stealth = stealthEnabled() } = {}) {
  if (!stealth) return baseChromium;
  const browser = addExtra(baseChromium);
  browser.use(StealthPlugin());
  return browser;
}

// Login, session probes, and generation share one plugin configuration.
export const chromium = createChromium();
