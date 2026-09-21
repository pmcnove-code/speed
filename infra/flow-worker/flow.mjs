import {MAX_CLIP_ATTEMPTS,generationDeadline,JOB_TIMEOUT_MESSAGE,CLIP_RETRY_LIMITS,retryDelayMs,freshAttemptMetadata} from "./retry-policy.mjs";
import { partitionClipsForLanes } from "./partition.mjs";
import { createClipPool } from "./clip-pool.mjs";
import { strictClipPrompt } from "./clip-v33.mjs";
import { createRenderBudget } from "./render-budget.mjs";
import { assetGender } from "../../shared/flow/gender.mjs";
import { newRenderFailure, renderReadyToOpen } from "./render-ready.mjs";
import { chromium } from "./browser.mjs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { DATA_DIR, hasChromeProfile, profileDir, readReady, unlockProfile, writeReady } from "./store.mjs";
import { captionRole, normalizeClips } from "./clips.mjs";
import { isPlayableTake, MIN_CLIP_BYTES } from "./ffmpeg.mjs";
import { extractSignedInAs, pickAccountEmail } from "./identity.mjs";
import { isFlowProjectUrl, looksFlowBlocked, looksLoggedInToFlow, looksSignedOut } from "./signed-in.mjs";
import {
  clickLocator,
  clickXY,
  mouseClickBox,
  pause,
  pollPauseMs,
  think,
} from "./human.mjs";
import { clickPointFromPlayBadge, isGridClipTile, newClipTitles, scoreAutoTitle } from "./tiles.mjs";
import { dialogueFingerprint, promptLanded, spokenLog } from "./prompt.mjs";
import { assertSpeechMatches, captionWordsFor, speechKeysFrom } from "./speech.mjs";
import { requireClipDuration, settingsMeetContract, settingsPanelLooksOpen } from "./preflight.mjs";
import {
  attachDispatchState,
  markClipDispatched,
  recoveryForClip,
  restoreClipState,
  setClipPhase,
} from "./clip-state.mjs";
import {
  assetIdFromEditUrl,
  checkpointAssetUrl,
  candidateMatchesAsset,
  identifyNewEditAsset,
  minimumExpectedDurationMs,
} from "./asset-identity.mjs";
import {
  resolveFlowVoice,
  rankAvailableVoices,
  rankAvailableCharacters,
  isFlowAssetChrome,
  FLOW_PRESET_TRAITS,
  FLOW_VOICE_PROFILES,
} from "./voices.mjs";
import {
  createFlowRpcClient,
  flowGenerationTransport,
  resolveCharacter,
  resolveVoice,
} from "./flow-rpc.mjs";

export { extractEmail, extractSignedInAs, isAccountEmail, pickAccountEmail } from "./identity.mjs";
export { isFlowAppUrl, isFlowProjectUrl, looksLoggedInToFlow, looksSignedOut } from "./signed-in.mjs";
export { clickPointFromPlayBadge, isGridClipTile } from "./tiles.mjs";

export const FLOW_URL = "https://flow.google.com/";
export const UI_CHANGED = "Flow UI changed / session expired — reconnect.";
export const SESSION_EXPIRED = "Flow session expired — reconnect.";
export const OUT_OF_CREDITS = "This Flow account is out of credits.";
export const FLOW_BLOCKED =
  "Flow paused this Google account for unusual activity. Wait before generating again — retrying makes the block last longer.";
const HEADLESS = process.env.FLOW_HEADLESS !== "0";
const INTER_GENERATION_MS = Math.max(
  1_000,
  Math.min(30_000, Number(process.env.FLOW_INTER_GENERATION_MS || 3_000)),
);
const artifactDirs = new WeakMap();

function sessionChrome() {
  return {
    executablePath: process.env.FLOW_CHROME_PATH || undefined,
    headless: HEADLESS,
    args: chromeArgs(),
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    locale: "en-US",
    timezoneId: process.env.TZ || "Europe/Paris",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  };
}

export function chromeArgs() {
  return ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--password-store=basic"];
}

export async function screenshot(page, name = "last-error.png") {
  try {
    const dir = artifactDirs.get(page) || DATA_DIR;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, name);
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return null;
  }
}

async function visibleClick(locator, timeout = 800) {
  const el = locator.first();
  if (!(await el.isVisible({ timeout }).catch(() => false))) return false;
  try {
    await clickLocator(el, { timeout: Math.min(Math.max(timeout, 800), 4000) });
    return true;
  } catch {
    await el.click({ force: true, timeout: 2000 }).catch(() => undefined);
    return true;
  }
}

async function clickAny(page, names, timeout = 800) {
  const roles = ["button", "menuitem", "tab", "option", "radio", "link"];
  for (const name of names) {
    for (const role of roles) {
      if (await visibleClick(page.getByRole(role, { name }), timeout)) return true;
    }
    if (await visibleClick(page.getByText(name, { exact: true }), timeout)) return true;
    if (await visibleClick(page.getByText(name, { exact: false }), timeout)) return true;
  }
  return false;
}

async function bodyText(page) {
  return page.locator("body").innerText().catch(() => "");
}

export function parseCreditsFromText(text) {
  const s = String(text || "");
  const patterns = [
    /(\d+)\s*(?:AI\s*)?credits?\b/i,
    /credits?\s*(?:remaining|left)?\s*[·:]\s*(\d+)/i,
    /(\d+)\s*(?:remaining|left)\s*credits?/i,
    /\bcredits\b[^\d]{0,12}(\d+)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

async function readSignedInAs(page) {
  const sources = [
    await page.locator('[aria-label*="Signed in as"], [aria-label*="Google Account"]').first().getAttribute("aria-label", { timeout: 400 }).catch(() => ""),
    await page.locator('[title*="Signed in as"]').first().getAttribute("title", { timeout: 400 }).catch(() => ""),
    await bodyText(page),
  ];
  for (const source of sources) {
    const email = extractSignedInAs(source);
    if (email) return email;
  }
  const chip = page.locator('[aria-label*="Google Account"], [aria-label*="Signed in as"]').first();
  if (await chip.count().catch(() => 0)) {
    await chip.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const menu = extractSignedInAs(
      await page.locator('[role="menu"], [role="dialog"]').first().innerText().catch(() => ""),
    );
    await page.keyboard.press("Escape").catch(() => undefined);
    if (menu) return menu;
  }
  return null;
}

async function readListAccounts(page) {
  const raw = await page
    .evaluate(async () => {
      const res = await fetch("https://accounts.google.com/ListAccounts?json=standard", { credentials: "include" });
      return res.ok ? await res.text() : "";
    })
    .catch(() => "");
  return pickAccountEmail(raw);
}

async function readAccountsGoogle(context) {
  const extra = await context.newPage();
  try {
    for (const url of ["https://accounts.google.com/", "https://myaccount.google.com/"]) {
      await extra.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => undefined);
      const email = (await readSignedInAs(extra)) || (await readListAccounts(extra));
      if (email) return email;
    }
    return null;
  } catch {
    return null;
  } finally {
    await extra.close().catch(() => undefined);
  }
}

/**
 * Logged-in Google identity from high-confidence sources only:
 * account-picker "Signed in as <email>" (not @google.com) or ListAccounts (not @google.com).
 * Page chrome / footers / storage blobs are never used.
 */
export async function resolveAccountIdentity(page, context, _storageState) {
  const signedIn = await readSignedInAs(page);
  if (signedIn) return signedIn;

  const listed = await readListAccounts(page);
  if (listed) return listed;

  if (context) {
    const fromAccounts = await readAccountsGoogle(context);
    if (fromAccounts) return fromAccounts;
  }

  return null;
}

export function looksOutOfCredits(text) {
  return /out of credits|no credits left|not enough credits|insufficient credits|you(?:'ve| have) run out of credits/i.test(
    text,
  );
}

function failUi(page, err) {
  return dumpUi(page)
    .then(() => screenshot(page))
    .then(() => {
      throw err instanceof Error ? err : new Error(String(err || UI_CHANGED));
    });
}

async function dumpUi(page, name = "last-error-ui.txt") {
  try {
    const dump = await page.evaluate(() => {
      const labels = [
        ...new Set(
          [...document.querySelectorAll("button, [role='button'], [role='menuitem'], [role='tab'], [role='option'], [role='radio'], [aria-label]")]
            .map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim())
            .filter((t) => t && t.length < 120),
        ),
      ].slice(0, 200);
      const body = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 5000);
      const hrefs = [
        ...new Set(
          [...document.querySelectorAll("a[href*='/edit/']")].map((a) => a.href).filter(Boolean),
        ),
      ].slice(0, 20);
      const overlay = document.querySelector(".cdk-overlay-container");
      const media = [...document.querySelectorAll("img, video, canvas")]
        .filter((el) => !overlay?.contains(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`;
        })
        .filter((s) => !/ 0x0 /.test(s))
        .slice(0, 25);
      const plays = [...document.querySelectorAll("button, [role='button']")]
        .filter((el) => /play_circle/i.test(`${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)} vis=${r.width > 0 && r.height > 0}`;
        })
        .slice(0, 10);
      return { labels, body, hrefs, media, plays };
    });
    const dir = artifactDirs.get(page) || DATA_DIR;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(dir, name),
      `${page.url()}\ninEditor=${/\/edit\//.test(page.url())}\n\n## labels\n${(dump.labels || []).join("\n")}\n\n## edit hrefs\n${(dump.hrefs || []).join("\n")}\n\n## media\n${(dump.media || []).join("\n")}\n\n## play_circle boxes\n${(dump.plays || []).join("\n")}\n\n## text\n${dump.body || ""}\n`,
    );
  } catch {
    /* ignore */
  }
}

async function waitForLoadingGone(page, timeout = 20_000) {
  await page
    .getByText(/^loading\.?\.?\.?$/i)
    .first()
    .waitFor({ state: "hidden", timeout })
    .catch(() => undefined);
}

async function composerReady(page) {
  if (await page.getByRole("button", { name: /settings trigger/i }).isVisible({ timeout: 500 }).catch(() => false)) {
    return true;
  }
  if (await page.getByRole("button", { name: /add ingredients to the prompt box/i }).isVisible({ timeout: 400 }).catch(() => false)) {
    return true;
  }
  if (
    await page
      .getByPlaceholder(/what do you want to create|add a prompt|enter a prompt/i)
      .first()
      .isVisible({ timeout: 400 })
      .catch(() => false)
  ) {
    return true;
  }
  return false;
}

async function dismissFlowChrome(page) {
  const names = [
    /dismiss banner/i,
    /ok,\s*got it/i,
    /got it/i,
    /accept all/i,
    /accept cookies/i,
    /i agree/i,
    /^close$/i,
  ];
  for (let pass = 0; pass < 2; pass++) {
    for (const name of names) {
      for (const role of ["button", "link"]) {
        const el = page.getByRole(role, { name }).first();
        if (await el.count().catch(() => 0)) {
          await el.click({ timeout: 2000, force: true }).catch(() => undefined);
          await page.waitForTimeout(120);
        }
      }
      const text = page.getByText(name).first();
      if (await text.count().catch(() => 0)) {
        await text.click({ timeout: 2000, force: true }).catch(() => undefined);
      }
    }
  }
  await page
    .evaluate(() => {
      const nodes = [...document.querySelectorAll("button, [role='button'], a, [aria-label]")];
      const hit = nodes.find((el) => /ok,\s*got it|got it|accept all|accept cookies/i.test(
        `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`,
      ));
      if (hit instanceof HTMLElement) hit.click();
    })
    .catch(() => undefined);
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const btn = frame.getByRole("button", { name: /got it|accept all|accept cookies/i }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 2000, force: true }).catch(() => undefined);
    }
  }
  await page
    .evaluate(() => {
      const nodes = [...document.querySelectorAll("button, [role='button'], a, [aria-label]")];
      for (const el of nodes) {
        const t = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
        if (!/ok,\s*got it|learn more about how google uses cookies/i.test(t)) continue;
        const host =
          el.closest("[role='dialog'], [role='alertdialog'], [class*='banner'], [class*='snackbar'], [class*='consent']") ||
          el;
        host.remove();
      }
    })
    .catch(() => undefined);
}

async function waitForDashboard(page) {
  const candidates = [
    page.getByRole("button", { name: /open project/i }).first(),
    page.getByRole("button", { name: /new project/i }).first(),
    page.getByText(/^new project$/i).first(),
  ];
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    for (const loc of candidates) {
      if (await loc.isVisible({ timeout: 300 }).catch(() => false)) return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

async function goFlowHome(page) {
  const home = page.getByRole("button", { name: /^home$/i }).first();
  if (await home.isVisible({ timeout: 800 }).catch(() => false)) {
    await home.click({ timeout: 5000 }).catch(() => undefined);
  } else {
    await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
  }
  await page.waitForTimeout(2000);
  await waitForDashboard(page);
}

async function renameProject(page, name = "Copy Studio") {
  const title = page.getByRole("textbox", { name: /editable text/i }).first();
  if (!(await title.isVisible({ timeout: 800 }).catch(() => false))) return false;
  await title.click({ timeout: 2000 }).catch(() => undefined);
  await page.keyboard.press("Meta+A").catch(() => undefined);
  await page.keyboard.press("Control+A").catch(() => undefined);
  await page.keyboard.type(name);
  await page.keyboard.press("Enter").catch(() => undefined);
  await pause(page, 500, 1100);
  return true;
}

async function flushProject(page) {
  if (!page || page.isClosed() || !/\/project\//.test(page.url())) return;
  await renameProject(page).catch(() => undefined);
  await goFlowHome(page).catch(() => undefined);
}

async function openFlowProject(page) {
  if (await composerReady(page)) return true;
  await waitForDashboard(page);
  await dismissFlowChrome(page);

  const openExisting = page.getByRole("button", { name: /^open project$/i }).first();
  const newBtn = page.getByRole("button", { name: /new project/i }).filter({ visible: true }).last();
  const newText = page.getByText(/^new project$/i).last();

  if (await openExisting.isVisible({ timeout: 2500 }).catch(() => false)) {
    await openExisting.click({ timeout: 8000 }).catch(() => undefined);
  } else if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newBtn.click({ timeout: 8000 }).catch(() => undefined);
  } else if (await newText.isVisible({ timeout: 1500 }).catch(() => false)) {
    await newText.click({ timeout: 8000 }).catch(() => undefined);
  } else {
    await clickAny(page, [/\bnew project\b/i, /^open project$/i], 2000);
  }

  const landed = await page.waitForURL(/\/project\//, { timeout: 15_000 }).then(() => true).catch(() => false);
  if (!landed) {
    if (await newBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await newBtn.click({ force: true, timeout: 4000 }).catch(() => undefined);
    } else if (await newText.isVisible({ timeout: 800 }).catch(() => false)) {
      await newText.click({ force: true, timeout: 4000 }).catch(() => undefined);
    }
    await page.waitForURL(/\/project\//, { timeout: 15_000 }).catch(() => undefined);
  }

  await waitForLoadingGone(page, 30_000);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await composerReady(page)) {
      await page.waitForTimeout(1500);
      await renameProject(page).catch(() => undefined);
      return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

async function waitForComposer(page) {
  try {
    await waitForLoadingGone(page);
    await dismissFlowChrome(page);
    if (await composerReady(page)) return;
    if (!(await openFlowProject(page))) {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (await composerReady(page)) return;
        await page.waitForTimeout(400);
      }
    }
    if (await composerReady(page)) return;
    // Google occasionally redirects a stale/slow session to the marketing
    // page (/about) or a project 404 instead of the app dashboard. That
    // page has none of the buttons the recovery flow above looks for, so
    // it always times out. One explicit reload of the app root recovers
    // most of these without giving up the whole job.
    if (/\/(about|404)(?:[/?]|$)/i.test(page.url())) {
      await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
      await waitForLoadingGone(page);
      await dismissFlowChrome(page);
      if (await composerReady(page)) return;
      if (await openFlowProject(page)) return;
    }
    const finalUrl = page.url();
    // Landing on the logged-out marketing page even after a reload of the
    // app root means the stored session is no longer valid, not a
    // transient hiccup — surface it as EXPIRED so the account stops being
    // retried and the account list prompts the user to reconnect.
    if (/\/about(?:[/?]|$)/i.test(finalUrl)) {
      throw Object.assign(
        new Error(`Flow session appears signed out (redirected to ${finalUrl}). Reconnect this account in Settings.`),
        { code: "EXPIRED" },
      );
    }
    throw new Error(`Flow project did not open (${finalUrl}).`);
  } catch (err) {
    await dumpUi(page);
    await screenshot(page);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { code: err?.code || "UI" });
  }
}

async function detectSession(page, context, { checkBlocked = true } = {}) {
  const url = page.url();
  const text = await bodyText(page);
  if (looksSignedOut(url, text)) throw Object.assign(new Error(SESSION_EXPIRED), { code: "EXPIRED" });
  if (checkBlocked && looksFlowBlocked(text)) {
    throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
  }
  if (looksOutOfCredits(text)) throw Object.assign(new Error(OUT_OF_CREDITS), { code: "CREDITS" });
  return { credits: parseCreditsFromText(text), text, email: await resolveAccountIdentity(page, context) };
}

async function fillField(page, names, value) {
  if (!value) return false;
  for (const name of names) {
    const box = page.getByLabel(name, { exact: false }).first();
    if (await box.isVisible({ timeout: 1500 }).catch(() => false)) {
      await box.fill(String(value));
      return true;
    }
    const ph = page.getByPlaceholder(name, { exact: false }).first();
    if (await ph.isVisible({ timeout: 800 }).catch(() => false)) {
      await ph.fill(String(value));
      return true;
    }
  }
  return false;
}

async function newFlowComposer(page) {
  return page.getByPlaceholder(/what do you want to create|add a prompt|enter a prompt/i).first();
}

async function isNewFlowHome(page) {
  const box = await newFlowComposer(page);
  if (await box.isVisible({ timeout: 800 }).catch(() => false)) return true;
  return page.getByText(/start creating or drop media/i).first().isVisible({ timeout: 400 }).catch(() => false);
}

async function composerCard(page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: /^agent$/i }) })
    .filter({ has: page.getByRole("button", { name: /start generation|settings trigger/i }) })
    .first();
}

async function composerPromptText(page) {
  const fromEd = await page
    .evaluate(() => {
      const start = [...document.querySelectorAll("button")].find((el) =>
        /start generation/i.test(el.getAttribute("aria-label") || ""),
      );
      let root = start?.parentElement || document.body;
      while (root && root !== document.body) {
        const ed = root.querySelector("[contenteditable='true'], textarea, [role='textbox']");
        if (ed) return `${ed.innerText || ""} ${ed.textContent || ""} ${ed.value || ""}`.trim();
        root = root.parentElement;
      }
      const ed = document.querySelector("[contenteditable='true']");
      return `${ed?.innerText || ""} ${ed?.textContent || ""}`.trim();
    })
    .catch(() => "");
  if (fromEd) return fromEd;
  const card = await composerCard(page);
  if (await card.count()) return card.innerText().catch(() => "");
  const bar = await composerBar(page);
  if (await bar.count()) return bar.innerText().catch(() => "");
  return "";
}

async function promptIsFilled(page, prompt) {
  const hint = page.getByText(/what do you want to create/i).last();
  if (await hint.isVisible({ timeout: 250 }).catch(() => false)) return false;
  return promptLanded(await composerPromptText(page), prompt);
}

async function focusComposer(page) {
  const hint = page.getByText(/what do you want to create/i).last();
  if (await hint.isVisible({ timeout: 800 }).catch(() => false)) {
    await clickLocator(hint).catch(() => hint.click({ timeout: 3000 }).catch(() => undefined));
    await pause(page, 180, 480);
    return true;
  }
  const card = await composerCard(page);
  const targets = [card.locator("[contenteditable='true']").last(), card.getByRole("textbox").last()];
  for (const loc of targets) {
    if (await loc.isVisible({ timeout: 400 }).catch(() => false)) {
      await clickLocator(loc).catch(() => loc.click({ timeout: 3000 }).catch(() => undefined));
      await pause(page, 160, 420);
      return true;
    }
  }
  const box = await card.boundingBox().catch(() => null);
  if (!box) return false;
  await clickXY(page, box.x + box.width * 0.5, box.y + Math.min(36, box.height * 0.22));
  await pause(page, 160, 400);
  return true;
}

async function setComposerText(page, text) {
  try {
    return await page.evaluate((value) => {
      const start = [...document.querySelectorAll("button")].find((el) =>
        /start generation/i.test(el.getAttribute("aria-label") || ""),
      );
      let root = start?.parentElement || document.body;
      while (root && root !== document.body) {
        if (root.querySelector("[contenteditable='true'], textarea, [role='textbox']")) break;
        root = root.parentElement;
      }
      const ed = (root || document).querySelector("[contenteditable='true'], textarea, [role='textbox']");
      if (!ed) return false;
      if ("value" in ed && ed.getAttribute("contenteditable") !== "true") {
        ed.value = value;
      } else {
        ed.focus?.();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(ed);
        sel?.removeAllRanges();
        sel?.addRange(range);
        if (!document.execCommand("insertText", false, value)) {
          while (ed.firstChild) ed.removeChild(ed.firstChild);
          ed.appendChild(document.createTextNode(value));
        }
      }
      ed.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertFromPaste" }));
      ed.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, text);
  } catch {
    return false;
  }
}

async function fillPrompt(page, prompt, { replace = true } = {}) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await pause(page, 140, 420);
  if (await promptIsFilled(page, prompt)) return true;
  if (!(await focusComposer(page))) return false;
  await pause(page, 120, 380);
  if (replace) {
    await page.keyboard.press("Meta+A").catch(() => undefined);
    await page.keyboard.press("Control+A").catch(() => undefined);
    await pause(page, 40, 120);
    await page.keyboard.press("Backspace").catch(() => undefined);
  }
  await page.keyboard.insertText(prompt).catch(() => undefined);
  await pause(page, 320, 1100);
  if (await promptIsFilled(page, prompt)) return true;

  const typed = await page
    .evaluate((value) => {
      const start = [...document.querySelectorAll("button")].find((el) =>
        /start generation/i.test(el.getAttribute("aria-label") || ""),
      );
      if (!start) return false;
      let root = start.parentElement;
      while (root && root !== document.body) {
        if (root.querySelector("[contenteditable='true'], [role='textbox'], textarea")) break;
        root = root.parentElement;
      }
      const ed = root?.querySelector("[contenteditable='true'], [role='textbox'], textarea");
      const hint = [...(root || document).querySelectorAll("div, span, p")].find((el) =>
        /^what do you want to create/i.test((el.textContent || "").trim()),
      );
      (ed || hint)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const target = ed || document.activeElement;
      if (!target) return false;
      target.focus?.();
      try {
        document.execCommand("selectAll", false, undefined);
        if (document.execCommand("insertText", false, value)) return true;
      } catch {
        /* Trusted Types / execCommand */
      }
      try {
        if ("value" in target && target.getAttribute?.("contenteditable") !== "true") {
          target.value = value;
        } else {
          while (target.firstChild) target.removeChild(target.firstChild);
          target.appendChild(document.createTextNode(value));
        }
        target.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
        return true;
      } catch {
        return false;
      }
    }, prompt)
    .catch(() => false);
  await pause(page, 280, 900);
  if (Boolean(typed) && (await promptIsFilled(page, prompt))) return true;

  await setComposerText(page, prompt);
  await pause(page, 280, 800);
  return promptIsFilled(page, prompt);
}

async function uploadFile(page, filePath, openNames) {
  const waiter = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  await clickAny(page, openNames, 4000);
  const chooser = await waiter;
  if (chooser) {
    await chooser.setFiles(filePath);
    return true;
  }
  const input = page.locator('input[type="file"]').last();
  if (await input.count()) {
    await input.setInputFiles(filePath);
    return true;
  }
  return false;
}

async function setToggle(page, name, on) {
  const sw = page.getByRole("switch", { name }).first();
  if (await sw.isVisible({ timeout: 2000 }).catch(() => false)) {
    const checked = (await sw.getAttribute("aria-checked")) === "true";
    if (checked !== on) await sw.click();
    return true;
  }
  const btn = page.getByRole("button", { name }).first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    const pressed = (await btn.getAttribute("aria-pressed")) === "true";
    const checked = (await btn.getAttribute("aria-checked")) === "true";
    const isOn = pressed || checked || /on|locked/i.test((await btn.getAttribute("aria-label")) || "");
    if (isOn !== on) await btn.click();
    return true;
  }
  return clickAny(page, [name], 1500);
}

async function toggleIsOn(page, name) {
  const candidates = [
    page.getByRole("switch", { name }).first(),
    page.getByRole("button", { name }).first(),
  ];
  for (const control of candidates) {
    if (!(await control.isVisible({ timeout: 400 }).catch(() => false))) continue;
    const checked = await control.getAttribute("aria-checked").catch(() => null);
    const pressed = await control.getAttribute("aria-pressed").catch(() => null);
    const label = (await control.getAttribute("aria-label").catch(() => "")) || "";
    if (checked != null) return checked === "true";
    if (pressed != null) return pressed === "true";
    if (/\b(on|locked|enabled)\b/i.test(label)) return true;
    if (/\b(off|unlocked|disabled)\b/i.test(label)) return false;
  }
  return null;
}

async function agentOff(page) {
  await setToggle(page, /agent/i, false);
  const agent = page.getByRole("button", { name: /^agent$/i }).first();
  if (!(await agent.isVisible({ timeout: 600 }).catch(() => false))) return;
  const pressed = (await agent.getAttribute("aria-pressed")) === "true";
  const checked = (await agent.getAttribute("aria-checked")) === "true";
  if (pressed || checked) await agent.click({ timeout: 4000 }).catch(() => undefined);
}

async function settingsPanelOpen(page) {
  const hay = await page
    .evaluate(() => {
      const labels = [...document.querySelectorAll("button, [role='button'], [role='option'], [role='radio'], [aria-label]")]
        .map((el) => `${el.getAttribute("aria-label") || ""} ${(el.textContent || "").replace(/\s+/g, " ")}`)
        .join("\n");
      const overlay = document.querySelector(".cdk-overlay-container")?.innerText || "";
      return `${labels}\n${overlay}`;
    })
    .catch(() => "");
  return settingsPanelLooksOpen(hay);
}

async function openSettingsChip(page) {
  await waitForComposer(page);
  await dismissFlowChrome(page);
  const trigger = page.getByRole("button", { name: /settings trigger/i }).first();
  const bar = await composerBar(page);
  const scoped = (await bar.count()) ? bar : page;
  const chip = scoped.getByRole("button").filter({ hasText: /720p|1080p|omni|nano banana|ingredients|video\s*·/i }).last();
  const clicked =
    (await visibleClick(trigger, 2000)) ||
    (await visibleClick(chip, 1200)) ||
    (await clickAny(page, [/720p/i, /video\s*·/i], 800));
  if (!clicked && (await trigger.isVisible({ timeout: 400 }).catch(() => false))) {
    await trigger.click({ force: true, timeout: 4000 }).catch(() => undefined);
  }
  await page.waitForTimeout(450);
  const deadline = Date.now() + 6_000;
  let open = await settingsPanelOpen(page);
  while (!open && Date.now() < deadline) {
    await page.waitForTimeout(250);
    open = await settingsPanelOpen(page);
  }
  await dumpUi(page, "last-settings-ui.txt");
  await screenshot(page, "last-settings.png").catch(() => undefined);
  return open;
}

async function addVoicesButton(page) {
  return page.getByRole("button", { name: /add voices/i }).first();
}

async function addVoicesVisible(page) {
  const voices = await addVoicesButton(page);
  return voices.isVisible({ timeout: 800 }).catch(() => false);
}

async function ingredientsComposerReady(page) {
  if (await addVoicesVisible(page)) return true;
  const add = page.getByRole("button", { name: /add ingredients to the prompt box/i }).first();
  return add.isVisible({ timeout: 800 }).catch(() => false);
}

async function pickInPanel(page, names) {
  for (const name of names) {
    for (const role of ["button", "tab", "option", "radio", "menuitem"]) {
      if (await visibleClick(page.getByRole(role, { name }), 800)) return true;
    }
    if (await visibleClick(page.getByText(name, { exact: true }), 500)) return true;
  }
  return false;
}

function chipShowsDuration(hay, wanted) {
  return new RegExp(`video\\s*·\\s*\\d{3,4}p\\s*·\\s*${wanted}s`, "i").test(String(hay || ""));
}

async function pickClipDuration(page, wanted) {
  const already = chipShowsDuration(await composerSettingHay(page), wanted);
  if (already) return true;
  const names = [
    new RegExp(`^${wanted}\\s*s$`, "i"),
    new RegExp(`^${wanted}s$`, "i"),
    new RegExp(`^${wanted}\\s*seconds?$`, "i"),
  ];
  if (await pickInPanel(page, names)) return true;
  const clicked = await page
    .evaluate((sec) => {
      const re = new RegExp(`^\\s*${sec}\\s*s\\s*$`, "i");
      const nodes = [...document.querySelectorAll("button, [role='button'], [role='radio'], [role='option']")];
      const hit = nodes.find((el) => re.test((el.textContent || "").replace(/\s+/g, " ").trim()));
      if (hit instanceof HTMLElement) {
        hit.click();
        return true;
      }
      return false;
    }, wanted)
    .catch(() => false);
  if (clicked) return true;
  return already || chipShowsDuration(await composerSettingHay(page), wanted);
}

async function ensureIngredientsMode(page) {
  if (await ingredientsComposerReady(page)) return true;
  await agentOff(page);
  if (!(await openSettingsChip(page))) return false;
  if (await page.getByText(/nano banana/i).first().isVisible({ timeout: 400 }).catch(() => false)) {
    await pickInPanel(page, [/^video$/i]);
  }
  await pickInPanel(page, [/gemini omni flash/i, /omni flash 1/i, /omni flash/i, /gemini omni/i]);
  await pickInPanel(page, [
    /video ingredients/i,
    /ingredients to video/i,
    /ingredients\/references/i,
    /^ingredients$/i,
  ]);
  await page.waitForTimeout(250);
  if (await ingredientsComposerReady(page)) return true;
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(250);
  return ingredientsComposerReady(page);
}

async function applyClipSettings(page, durationSec = 8) {
  const wanted = requireClipDuration(durationSec);
  await waitForComposer(page);
  await agentOff(page);
  if (!(await openSettingsChip(page))) {
    if (!(await openSettingsChip(page))) {
      throw Object.assign(new Error("Flow: settings panel did not open."), { code: "SETTINGS" });
    }
  }
  if (await page.getByText(/nano banana/i).first().isVisible({ timeout: 400 }).catch(() => false)) {
    await pickInPanel(page, [/^video$/i]);
  }
  await pickInPanel(page, [/^video$/i, /videocam\s*video/i]);
  await pickInPanel(page, [/select model family/i, /veo 3/i, /arrow_drop_down/i]);
  const modelOk = await pickInPanel(page, [
    /omni\s*1(?:\.\d+)?\s*flash/i,
    /gemini omni flash/i,
    /omni flash 1/i,
    /omni flash/i,
    /gemini omni/i,
  ]);
  const ingredientsOk = await pickInPanel(page, [
    /^ingredients$/i,
    /video ingredients/i,
    /ingredients to video/i,
    /chrome_extension\s*ingredients/i,
  ]);
  const durationOk = await pickClipDuration(page, wanted);
  if (!durationOk) {
    throw Object.assign(
      new Error(`Flow: ${wanted}s is required by the clip contract but is not available in the settings panel.`),
      { code: "SETTINGS" },
    );
  }
  await pickInPanel(page, [/^x1$/i, /^1x$/i, /outputs?\s*1/i]);
  const cameraControl =
    (await setToggle(page, /camera lock/i, true)) ||
    (await setToggle(page, /lock camera|static camera|camera locked/i, true));
  const cameraLocked =
    (await toggleIsOn(page, /camera lock/i)) ??
    (await toggleIsOn(page, /lock camera|static camera|camera locked/i));
  await pickInPanel(page, [/^9:16$/i, /crop_9_16/i]);
  await pickInPanel(page, [/^720p$/i]);
  if (cameraControl && cameraLocked !== true) {
    throw Object.assign(new Error("Flow: camera lock could not be enabled."), { code: "SETTINGS" });
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);
  const portraitX1 = await forcePortraitX1(page);
  const modeReady = await ensureIngredientsMode(page);
  const hay = await composerSettingHay(page);
  if (
    !portraitX1 ||
    !settingsMeetContract(hay, wanted) ||
    !modeReady
  ) {
    throw Object.assign(
      new Error(
        `Flow: settings preflight failed (${wanted}s, 720p, 9:16, x1, Omni Ingredients, camera lock required).`,
      ),
      { code: "SETTINGS" },
    );
  }
  return { durationSec: wanted, portrait: true, outputs: 1, cameraLocked: true };
}

async function settingsChipText(page) {
  const chip = page.getByRole("button", { name: /settings trigger/i }).first();
  const aria = (await chip.getAttribute("aria-label").catch(() => "")) || "";
  const text = (await chip.innerText().catch(() => "")) || "";
  return `${aria} ${text}`;
}

async function composerSettingHay(page) {
  const bar = await composerBar(page);
  const barText = (await bar.innerText().catch(() => "")) || "";
  const chipLine =
    (await page
      .getByText(/video\s*·\s*\d{3,4}p/i)
      .last()
      .innerText()
      .catch(() => "")) || "";
  return `${await settingsChipText(page)} ${barText} ${chipLine}`;
}

async function forceOutputsX1(page) {
  const hay = await composerSettingHay(page);
  if (/\bx1\b/i.test(hay) && !/\bx[2-4]\b/i.test(hay)) return true;
  const bar = await composerBar(page);
  const countChip = bar.getByRole("button", { name: /^x[1-4]$/i }).last();
  if (await countChip.isVisible({ timeout: 400 }).catch(() => false)) {
    await countChip.click({ timeout: 3000 }).catch(() => undefined);
  } else if (!(await openSettingsChip(page))) {
    return false;
  }
  await pickInPanel(page, [/^x1$/i, /^1x$/i, /outputs?\s*1/i, /generate 1/i]);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(200);
  const after = await composerSettingHay(page);
  return /\bx1\b/i.test(after) && !/\bx[2-4]\b/i.test(after);
}

async function forcePortraitX1(page) {
  for (let i = 0; i < 2; i++) {
    const hay = await composerSettingHay(page);
    const portrait = /crop_9_16|9\s*[:/]\s*16/i.test(hay) && !/crop_16_9/i.test(hay);
    const x1 = /\bx1\b/i.test(hay) && !/\bx[2-4]\b/i.test(hay);
    if (portrait && x1) return true;
    if (!portrait) {
      const bar = await composerBar(page);
      const aspect = bar.getByRole("button", { name: /crop_16_9|crop_9_16|16:9|9:16/i }).last();
      if (await aspect.isVisible({ timeout: 400 }).catch(() => false)) {
        await aspect.click({ timeout: 3000 }).catch(() => undefined);
      } else {
        await openSettingsChip(page);
      }
      await pickInPanel(page, [/^9:16$/i, /crop_9_16/i, /9\s*[:/]\s*16/]);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(200);
    }
    if (!x1) await forceOutputsX1(page);
  }
  return false;
}

function escapeRe(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function composerBar(page) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: /^agent$/i }) })
    .filter({ has: page.getByRole("button", { name: /start generation|settings trigger/i }) })
    .last();
}

async function voiceChipAttached(page, names = []) {
  if (await page.locator('[aria-label*="voice" i]').first().isVisible({ timeout: 400 }).catch(() => false)) {
    return true;
  }
  const bar = await composerBar(page);
  for (const name of names.filter(Boolean)) {
    const re = new RegExp(escapeRe(name), "i");
    if (await bar.getByText(re).first().isVisible({ timeout: 300 }).catch(() => false)) return true;
  }
  return false;
}

function voiceSearchLabels(voiceName, baseVoice, aliases = []) {
  const skip = new Set(["elder", "african", "farm", "paris", "doctor", "truck", "road", "mom", "ohio", "chinese", "heart", "coach"]);
  const extra = aliases.filter((a) => {
    const n = String(a).trim();
    return n.length >= 5 && !skip.has(n.toLowerCase());
  });
  return [...new Set([voiceName, ...extra, baseVoice].filter(Boolean))];
}

async function voicesPicker(page) {
  const named = [
    page.locator(".cdk-overlay-pane").last(),
    page.getByRole("dialog").filter({ hasText: /voice/i }).last(),
    page.getByRole("listbox").last(),
    page.locator("[role='menu']").filter({ hasText: /voice|charon|african/i }).last(),
  ];
  for (const loc of named) {
    if (await loc.isVisible({ timeout: 400 }).catch(() => false)) return loc;
  }
  return null;
}

async function assetOverlay(page) {
  const panes = page.locator(".cdk-overlay-pane");
  const n = await panes.count().catch(() => 0);
  for (let i = n - 1; i >= 0; i--) {
    const pane = panes.nth(i);
    if (await pane.getByPlaceholder(/search assets/i).isVisible({ timeout: 200 }).catch(() => false)) return pane;
    if (await pane.getByText(/add to prompt/i).first().isVisible({ timeout: 200 }).catch(() => false)) return pane;
  }
  const last = panes.last();
  if (await last.isVisible({ timeout: 300 }).catch(() => false)) return last;
  return page;
}

async function forceClick(locator) {
  const el = locator.first();
  if (!(await el.count().catch(() => 0))) return false;
  try {
    await clickLocator(el, { timeout: 2500 });
    return true;
  } catch {
    try {
      await el.scrollIntoViewIfNeeded().catch(() => undefined);
      await el.click({ force: true, timeout: 2500 });
      return true;
    } catch {
      return false;
    }
  }
}

async function voicesPresetsVisible(page) {
  const root = await assetOverlay(page);
  const algenib = root.getByText(/^algenib$/i).first();
  if (await algenib.isVisible({ timeout: 400 }).catch(() => false)) return true;
  const text = await root.innerText().catch(() => "");
  return /algenib/i.test(text) && /alnilam|algieba|aoede/i.test(text) && !/no assets found/i.test(text);
}

async function clearAssetSearch(page) {
  const search = (await assetOverlay(page)).getByPlaceholder(/search assets/i).first();
  if (!(await search.isVisible({ timeout: 400 }).catch(() => false))) return;
  const value = await search.inputValue().catch(() => "");
  if (!value) return;
  await search.click({ force: true, timeout: 2000 }).catch(() => undefined);
  await search.fill("");
  await page.waitForTimeout(300);
}

async function selectVoicesTab(page) {
  await clearAssetSearch(page);
  const root = await assetOverlay(page);
  const candidates = [
    root.getByLabel(/voices/i),
    root.getByRole("tab", { name: /voices/i }),
    root.getByRole("button", { name: /voices/i }),
    root.getByRole("listitem", { name: /voices/i }),
    root.getByText(/^voices$/i),
    page.getByRole("tab", { name: /voices/i }),
  ];
  for (const loc of candidates) {
    if (await forceClick(loc)) {
      const started = Date.now();
      while (Date.now() - started < 2500) {
        if (await voicesPresetsVisible(page)) return true;
        await page.waitForTimeout(200);
      }
    }
  }

  await page.evaluate(() => {
    const overlay = [...document.querySelectorAll(".cdk-overlay-pane")].at(-1) || document.body;
    const els = [
      ...overlay.querySelectorAll(
        "button, a, [role='tab'], [role='button'], [role='listitem'], [aria-label], [mat-list-item], .mdc-list-item",
      ),
    ];
    const tab = els.find((el) => {
      const hay = `${el.innerText || ""} ${el.getAttribute("aria-label") || ""}`;
      return /voices/i.test(hay) && !/add voices/i.test(hay);
    });
    if (!tab) return false;
    tab.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = tab.getBoundingClientRect();
    const common = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + Math.min(rect.width / 2, 24),
      clientY: rect.top + Math.min(rect.height / 2, 12),
      buttons: 1,
    };
    tab.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse" }));
    tab.dispatchEvent(new MouseEvent("mousedown", common));
    tab.dispatchEvent(new PointerEvent("pointerup", { ...common, pointerId: 1, pointerType: "mouse" }));
    tab.dispatchEvent(new MouseEvent("mouseup", common));
    tab.dispatchEvent(new MouseEvent("click", common));
    return true;
  });

  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (await voicesPresetsVisible(page)) return true;
    await page.waitForTimeout(250);
  }
  return voicesPresetsVisible(page);
}

function isAssetChromeLabel(name) {
  return isFlowAssetChrome(name);
}

async function clickVoiceRow(page, name) {
  if (!name || isAssetChromeLabel(name)) return false;
  const root = await assetOverlay(page);
  const re = new RegExp(escapeRe(name), "i");
  const exact = new RegExp(`^${escapeRe(name)}$`, "i");
  const candidates = [
    root.getByRole("button", { name: re }),
    root.getByRole("option", { name: re }),
    root.getByRole("listitem", { name: re }),
    root.getByLabel(re),
    root.getByText(exact),
  ];
  for (const loc of candidates) {
    if (await forceClick(loc)) return true;
  }
  return page.evaluate((voiceName) => {
    const n = String(voiceName || "").toLowerCase();
    const overlay = [...document.querySelectorAll(".cdk-overlay-pane")].at(-1) || document.body;
    const els = [
      ...overlay.querySelectorAll(
        "button, [role='button'], [role='listitem'], [role='option'], [role='menuitem'], [aria-label]",
      ),
    ];
    const row = els.find((el) => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const text = (el.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
      const first = (el.innerText || "").trim().split("\n").pop()?.toLowerCase().replace(/^voice_selection/, "").trim();
      if (/^(voices|all|images|videos|characters|uploads|asset list)$/i.test(first || "")) return false;
      if (/add to prompt|upload media|search assets/i.test(`${text} ${aria}`)) return false;
      return first === n || text.startsWith(n) || aria.includes(n);
    });
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    row.click();
    const rect = row.getBoundingClientRect();
    const common = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + Math.min(rect.width / 2, 40),
      clientY: rect.top + 10,
      buttons: 1,
    };
    row.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse" }));
    row.dispatchEvent(new MouseEvent("click", common));
    return true;
  }, name);
}

async function clickAddToPrompt(page) {
  const root = await assetOverlay(page);
  if (await forceClick(root.getByRole("button", { name: /add to prompt/i }))) return true;
  if (await forceClick(page.getByRole("button", { name: /add to prompt/i }))) return true;
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, [role='button']")].find(
      (el) => /add to prompt/i.test(el.innerText || "") || /add to prompt/i.test(el.getAttribute("aria-label") || ""),
    );
    if (!btn) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  });
}

async function searchAssets(page, name) {
  const search = (await assetOverlay(page)).getByPlaceholder(/search assets/i).first();
  if (!(await search.isVisible({ timeout: 800 }).catch(() => false))) return false;
  await search.click({ force: true, timeout: 3000 }).catch(() => undefined);
  await search.fill(name);
  await page.waitForTimeout(500);
  if (await page.getByText(/no assets found/i).first().isVisible({ timeout: 400 }).catch(() => false)) {
    await search.fill("");
    await page.waitForTimeout(400);
    return false;
  }
  return true;
}

async function listVisibleVoices(page) {
  await clearAssetSearch(page);
  const names = await page.evaluate(() => {
    const skip =
      /^(voices|all|images|videos|characters|uploads|asset list|add to prompt|upload media|search assets|recent|sort assets)$/i;
    const chrome = /navigation|category|asset list|sort assets|tile grid|filtering|accessibility|more options/i;
    const overlay = [...document.querySelectorAll(".cdk-overlay-pane")].at(-1) || document.body;
    const found = [];
    for (const el of overlay.querySelectorAll(
      "button, [role='button'], [role='listitem'], [role='option'], [role='menuitem'], [aria-label]",
    )) {
      const aria = (el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const raw = (aria || text).replace(/^voice_selection/i, "").trim();
      const first = (raw.split("\n")[0] || "").trim();
      if (!first || first.length > 48 || skip.test(first) || chrome.test(first)) continue;
      if (/add to prompt|upload media|search assets|no assets/i.test(raw)) continue;
      found.push(first.replace(/^Voice:\s*/i, "").trim());
    }
    return [...new Set(found.filter(Boolean))];
  });
  return names.filter((n) => !isFlowAssetChrome(n));
}

async function tryAttachNamedVoice(page, name) {
  if (!name) return null;
  await searchAssets(page, name);
  if (!(await clickVoiceRow(page, name))) {
    await clearAssetSearch(page);
    if (!(await clickVoiceRow(page, name))) return null;
  }
  await page.waitForTimeout(400);
  const added = await clickAddToPrompt(page);
  await page.waitForTimeout(600);
  if (added || (await voiceChipAttached(page, [name]))) return name;
  return null;
}

async function pickVoice(page, profile = {}) {
  // Adding a character closes the asset picker. Reopen it before selecting
  // the voice; looking for tabs on the composer silently skips this step.
  if (!(await voicesPresetsVisible(page))) await openAddMenu(page);
  if (!(await selectVoicesTab(page))) {
    await dumpUi(page, "last-voice-ui.txt");
    await screenshot(page, "last-voice.png").catch(() => undefined);
    return null;
  }

  const scraped = await listVisibleVoices(page);
  const preferred = String(profile.voicePick || "").trim();
  const ranked = rankAvailableVoices(profile, scraped);
  const tries = [...new Set((profile.genderLock && preferred ? [preferred] : [preferred, ...ranked]).filter((n) => n && !isAssetChromeLabel(n) && scraped.some((s) => s === n)))];

  for (const name of tries) {
    const attached = await tryAttachNamedVoice(page, name);
    if (attached) return attached;
    await selectVoicesTab(page).catch(() => false);
    await clearAssetSearch(page);
  }

  await dumpUi(page, "last-voice-ui.txt");
  await screenshot(page, "last-voice.png").catch(() => undefined);
  return null;
}

async function mentionVoice(page, profile) {
  const box = await newFlowComposer(page);
  if (!(await box.isVisible({ timeout: 800 }).catch(() => false))) return false;
  await clickLocator(box).catch(() => box.click().catch(() => undefined));
  await page.keyboard.type("@Voice");
  await pause(page, 180, 480);
  await clickAny(page, [/^voices$/i, /voice ingredient/i, /^@?voice$/i], 500);
  await page.keyboard.type(`: ${profile.voiceName || profile.baseVoice || ""}`);
  return pickVoice(page, profile);
}

async function createCustomVoice(page, profile) {
  if (!profile?.baseVoice || !profile?.voiceName) return false;
  await selectVoicesTab(page).catch(() => false);
  const opened = await clickAny(page, [/create new voice/i, /new voice/i, /custom voice/i], 1200);
  if (!opened) {
    await clickVoiceRow(page, profile.baseVoice);
  } else {
    await clickAny(page, [/base voice/i], 800);
    await clickAny(
      page,
      [new RegExp(`^${escapeRe(profile.baseVoice)}$`, "i"), new RegExp(escapeRe(profile.baseVoice), "i")],
      1200,
    );
  }
  await fillField(page, [/^name$/i, /voice name/i], profile.voiceName);
  await fillField(page, [/sample dialogue/i], profile.sampleDialogue);
  await fillField(page, [/voice performance/i], profile.voicePerformance);
  await clickAny(page, [/^sync$/i], 800);
  await page.waitForTimeout(1200);
  return clickAny(page, [/save new voice/i, /^save$/i], 2500);
}

async function clickOverlayCategory(page, label) {
  const overlay = await overlayPane(page);
  const re = new RegExp(`^${escapeRe(label)}$`, "i");
  if (await visibleClick(overlay.getByRole("tab", { name: re }), 700)) return true;
  if (await visibleClick(overlay.getByRole("button", { name: re }), 500)) return true;
  const box = await page.evaluate((wanted) => {
    const n = String(wanted || "").toLowerCase();
    const pane = [...document.querySelectorAll(".cdk-overlay-pane")].find((el) =>
      /search assets|add to prompt/i.test(el.innerText || ""),
    );
    if (!pane) return null;
    const els = [...pane.querySelectorAll("button, [role='tab'], [role='button'], [role='listitem'], a, [aria-label]")];
    const tab = els.find((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const raw = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
      const last = raw.split(" ").pop();
      const cleaned = raw.replace(/accessibility_new|voice_selection|videocam|dashboard|drive_folder_upload|image/g, " ").replace(/\s+/g, " ").trim();
      return cleaned === n || last === n || cleaned.endsWith(` ${n}`) || cleaned.endsWith(n);
    });
    if (!tab) return null;
    tab.scrollIntoView({ block: "nearest" });
    const rect = tab.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width / 2, 18), y: rect.top + Math.min(rect.height / 2, 12) };
  }, label);
  return mouseClickBox(page, box);
}

async function selectCharactersTab(page) {
  await openAddMenu(page);
  await clearAssetSearch(page);
  const overlay = page.locator(".cdk-overlay-pane").filter({ hasText: /search assets/i }).last();
  for (let i = 0; i < 5; i++) {
    const tab = overlay.getByText(/^characters$/i).last();
    if (await tab.isVisible({ timeout: 700 }).catch(() => false)) {
      const b = await tab.boundingBox().catch(() => null);
      if (b) await mouseClickBox(page, { x: b.x + Math.min(18, b.width / 2), y: b.y + b.height / 2 });
    } else {
      await clickOverlayCategory(page, "characters");
    }
    await page.waitForTimeout(500);
    const voiceList = await overlay.getByText(/^algenib$/i).first().isVisible({ timeout: 350 }).catch(() => false);
    if (!voiceList) return true;
  }
  await dumpUi(page, "last-add-ui.txt");
  await screenshot(page, "last-add.png").catch(() => undefined);
  return false;
}

async function selectUploadsTab(page) {
  await openAddMenu(page);
  await clickOverlayCategory(page, "uploads");
  await page.waitForTimeout(300);
  if (await page.getByRole("button", { name: /upload media/i }).first().isVisible({ timeout: 800 }).catch(() => false)) return true;
  await clickOverlayCategory(page, "images");
  await page.waitForTimeout(300);
  return page.getByRole("button", { name: /upload media/i }).first().isVisible({ timeout: 600 }).catch(() => false);
}

async function assetRowNamed(page, name) {
  if (!name) return false;
  if (await page.getByText(/no assets found/i).first().isVisible({ timeout: 300 }).catch(() => false)) return false;
  return page.evaluate((wanted) => {
    const n = String(wanted || "").toLowerCase();
    const overlay = [...document.querySelectorAll(".cdk-overlay-pane")].find((el) =>
      /search assets|add to prompt/i.test(el.innerText || ""),
    );
    if (!overlay) return false;
    const search = overlay.querySelector("input, textarea, [contenteditable='true']");
    for (const el of overlay.querySelectorAll("button, [role='button'], [role='listitem'], [role='option'], [aria-label]")) {
      if (search && (el === search || search.contains(el))) continue;
      const aria = (el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const first = (aria || text).split("\n")[0].replace(/^(voice_selection|accessibility_new)/i, "").trim();
      if (!first || first.length > 60) continue;
      if (/^(all|images|videos|voices|characters|uploads|add to prompt|upload media|search assets)$/i.test(first)) continue;
      if (first.toLowerCase() === n || first.toLowerCase().startsWith(n)) return true;
    }
    return false;
  }, name);
}

async function characterNamedVisible(page, name) {
  return assetRowNamed(page, name);
}

async function characterChipAttached(page, names = []) {
  const bar = await composerBar(page);
  for (const name of names.filter(Boolean)) {
    const re = new RegExp(`^${escapeRe(name)}$`, "i");
    const chip = bar.getByRole("button", { name: re });
    const n = await chip.count();
    for (let i = 0; i < n; i++) {
      const btn = chip.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      const box = await btn.boundingBox().catch(() => null);
      if (box && box.height <= 72 && box.width <= 260) return true;
    }
  }
  return false;
}

async function ingredientChipCount(page) {
  return page.getByRole("button", { name: /^ingredient$/i }).count();
}

async function tryAttachNamedCharacter(page, name) {
  if (!name) return false;
  if (await characterChipAttached(page, [name])) return true;
  await openAddMenu(page);
  const tabOk = await selectCharactersTab(page);
  await dumpUi(page, "last-add-ui.txt");
  await screenshot(page, "last-add.png").catch(() => undefined);
  if (!tabOk) return false;
  const before = await ingredientChipCount(page);
  await clearAssetSearch(page);
  let picked = await clickVoiceRow(page, name);
  if (!picked) {
    await searchAssets(page, name);
    picked = await clickVoiceRow(page, name);
  }
  if (!picked) {
    await clearAssetSearch(page);
    picked = await clickVoiceRow(page, name);
  }
  if (!picked) return false;
  await page.waitForTimeout(400);
  await clickAddToPrompt(page);
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape").catch(() => undefined);
  if (await characterChipAttached(page, [name])) return true;
  return (await ingredientChipCount(page)) > before;
}

async function uploadAvatarToDialog(page, avatarPath) {
  if (!avatarPath) return false;
  const dialog = page.getByRole("dialog").last();
  const inDialog = await dialog.isVisible({ timeout: 800 }).catch(() => false);
  const root = inDialog ? dialog : page;
  const waiter = page.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null);
  const uploadedClick = inDialog
    ? await visibleClick(root.getByRole("button", { name: /upload media|upload image|reference image|add photo|choose file|add image|^upload$/i }), 2000)
    : await clickAny(
        page,
        [/upload image/i, /reference image/i, /add photo/i, /choose file/i, /add image/i],
        2000,
      );
  if (!uploadedClick && inDialog) {
    await clickAny(
      page,
      [/upload image/i, /reference image/i, /add photo/i, /choose file/i, /add image/i],
      1500,
    );
  }
  const chooser = await waiter;
  if (chooser) {
    await chooser.setFiles(avatarPath);
    return true;
  }
  const input = (inDialog ? dialog : page).locator('input[type="file"]').last();
  if (await input.count()) {
    await input.setInputFiles(avatarPath);
    return true;
  }
  return false;
}

async function attachAvatarImage(page, avatarPath) {
  if (!avatarPath) return false;
  await openAddMenu(page);
  await selectUploadsTab(page);
  const before = await ingredientChipCount(page);
  if (await uploadAvatarToDialog(page, avatarPath)) {
    await page.waitForTimeout(800);
    await clickAddToPrompt(page).catch(() => undefined);
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape").catch(() => undefined);
    return (await ingredientChipCount(page)) > before;
  }
  return false;
}

async function returnToComposer(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  if (/\/character/.test(page.url())) {
    const back = page.getByRole("button", { name: /go back/i }).first();
    if (await back.isVisible({ timeout: 800 }).catch(() => false)) {
      await back.click({ timeout: 4000 }).catch(() => undefined);
    } else {
      await clickAny(page, [/go back/i, /arrow_back/i], 1200);
    }
    await page.waitForTimeout(700);
    if (/\/character/.test(page.url())) {
      await page.goto(page.url().replace(/\/character.*$/, ""), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    }
  }
  await clickAny(page, [/all media/i, /^home$/i, /^done$/i, /back button/i], 800);
  await waitForComposer(page);
}

async function onCharacterBuilder(page) {
  if (/\/character(?:\/|$|\?)/.test(page.url())) return true;
  return (await page.getByPlaceholder(/describe your character/i).first().isVisible({ timeout: 400 }).catch(() => false))
    || (await page.getByText(/describe your character/i).first().isVisible({ timeout: 400 }).catch(() => false));
}

async function clickSidebarCharacters(page) {
  const loc = page.getByRole("button", { name: /^characters$/i }).first();
  if (await loc.isVisible({ timeout: 600 }).catch(() => false)) {
    const b = await loc.boundingBox().catch(() => null);
    if (b && b.x < 240) {
      await mouseClickBox(page, { x: b.x + Math.min(28, b.width * 0.35), y: b.y + b.height / 2 });
      return true;
    }
  }
  const named = page.getByText(/^characters$/i);
  const n = await named.count();
  for (let i = 0; i < n; i++) {
    const el = named.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const b = await el.boundingBox().catch(() => null);
    if (!b || b.x > 240 || b.width > 280) continue;
    await mouseClickBox(page, { x: b.x + Math.min(28, b.width * 0.35), y: b.y + b.height / 2 });
    return true;
  }
  const box = await page.evaluate(() => {
    const els = [...document.querySelectorAll("button, a, [role='button'], [role='link'], [role='tab'], [role='listitem'], [role='menuitem']")];
    const matches = els
      .map((el) => {
        const r = el.getBoundingClientRect();
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        const last = t.split(" ").pop() || "";
        const aria = (el.getAttribute("aria-label") || "").trim();
        return { left: r.left, top: r.top, width: r.width, height: r.height, last, aria, t };
      })
      .filter(
        (x) =>
          x.left < 240 &&
          x.width > 16 &&
          x.height > 14 &&
          x.height < 96 &&
          (/^characters$/i.test(x.last) || /^characters$/i.test(x.aria) || /^characters$/i.test(x.t)),
      )
      .sort((a, b) => a.width * a.height - b.width * b.height);
    const el = matches[0];
    if (!el) return null;
    return { x: el.left + Math.min(28, el.width * 0.35), y: el.top + el.height / 2 };
  });
  return mouseClickBox(page, box);
}

async function characterListedInLibrary(page, name) {
  if (!name) return false;
  return page.evaluate((wanted) => {
    const n = String(wanted || "").toLowerCase();
    const overlay = document.querySelector(".cdk-overlay-container");
    return [...document.querySelectorAll("button, [role='button'], [aria-label], img")].some((el) => {
      if (overlay?.contains(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.left < 170 || r.width < 36) return false;
      const t = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""} ${el.getAttribute("alt") || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return t.includes(n);
    });
  }, name);
}

async function openNewCharacterForm(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  if (await onCharacterBuilder(page)) return true;
  if (await clickSidebarCharacters(page)) {
    await page.waitForTimeout(1000);
    await dumpUi(page, "last-character-library-ui.txt");
    await screenshot(page, "last-character-library.png").catch(() => undefined);
    if (await onCharacterBuilder(page)) return true;
    if (
      await clickAny(
        page,
        [/new character/i, /create new character/i, /create character/i, /add character/i],
        2500,
      )
    ) {
      await page.waitForTimeout(800);
      return onCharacterBuilder(page);
    }
  }
  return onCharacterBuilder(page);
}

async function uploadCharacterReference(page, avatarPath) {
  if (!avatarPath) return false;
  const waiter = page.waitForEvent("filechooser", { timeout: 12_000 }).catch(() => null);
  const btn = page.getByRole("button", { name: /^upload$/i }).first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click({ timeout: 4000 }).catch(() => undefined);
  } else {
    await clickAny(page, [/^upload$/i], 1500);
  }
  const chooser = await waiter;
  if (chooser) {
    await chooser.setFiles(avatarPath);
    return true;
  }
  const input = page.locator('input[type="file"]').last();
  if (await input.count()) {
    await input.setInputFiles(avatarPath);
    return true;
  }
  return false;
}

async function fillCharacterDescription(page, text) {
  const ph = page.getByPlaceholder(/describe your character/i).first();
  if (await ph.isVisible({ timeout: 1200 }).catch(() => false)) {
    await ph.click({ timeout: 3000 }).catch(() => undefined);
    await ph.fill(text).catch(() => undefined);
  } else {
    const hint = page.getByText(/describe your character/i).first();
    if (await hint.isVisible({ timeout: 800 }).catch(() => false)) {
      await hint.click({ timeout: 3000 }).catch(() => undefined);
    }
  }
  await page.keyboard.press("Meta+A").catch(() => undefined);
  await page.keyboard.press("Control+A").catch(() => undefined);
  await page.keyboard.insertText(text).catch(() => undefined);
  await page.waitForTimeout(300);
  const body = await bodyText(page);
  return body.includes(text.slice(0, 24));
}

async function waitForCharacterBuilt(page, _name, timeoutMs = 180_000) {
  let sawProgress = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await bodyText(page);
    if (/no assets found/i.test(text) && /search assets/i.test(text)) {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    const percents = await renderPercents(page);
    const pending = percents.filter((n) => n > 0 && n < 100);
    if (pending.length) sawProgress = true;
    const big = await page.evaluate(() =>
      [...document.querySelectorAll("img, video, canvas")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 180 && r.height >= 180 && r.top > 70 && r.left > 160;
      }),
    );
    const editor = /\/character\/[a-z0-9-]+/i.test(page.url());
    if (pending.length === 0 && editor && big) return true;
    if (sawProgress && percents.some((n) => n >= 100) && pending.length === 0) return true;
    await page.waitForTimeout(2000);
  }
  return false;
}

async function characterEditorOpen(page) {
  if (/\/character\/[a-z0-9-]+/i.test(page.url())) return true;
  return page.getByRole("button", { name: /^done$/i }).first().isVisible({ timeout: 400 }).catch(() => false);
}

async function openLibraryCharacter(page, names) {
  for (const name of names.filter(Boolean)) {
    if (await clickAny(page, [new RegExp(`^${escapeRe(name)}$`, "i")], 1800)) {
      await page.waitForTimeout(900);
      if (await characterEditorOpen(page)) return true;
    }
  }
  return false;
}

async function renameCharacter(page, name) {
  const edit = page.getByRole("button", { name: /edit name/i }).first();
  if (await edit.isVisible({ timeout: 800 }).catch(() => false)) {
    await edit.click({ timeout: 3000 }).catch(() => undefined);
  } else {
    await clickAny(page, [/untitled character/i, /character name/i], 1000);
  }
  const field = page.getByRole("textbox", { name: /character name/i }).first();
  if (await field.isVisible({ timeout: 1200 }).catch(() => false)) {
    await field.fill(name);
  } else {
    await page.keyboard.press("Meta+A").catch(() => undefined);
    await page.keyboard.press("Control+A").catch(() => undefined);
    await page.keyboard.insertText(name);
  }
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.waitForTimeout(400);
  return true;
}

async function finishCharacterEditor(page, profile, onProgress) {
  if (!(await characterEditorOpen(page))) return false;
  onProgress?.(`Flow: naming ${profile.character}…`);
  await renameCharacter(page, profile.character);
  await fillField(
    page,
    [/character info/i, /describe how your character acts/i, /character personality/i],
    profile.characterInfo,
  );
  const voiceBtn = page.getByRole("button", { name: /select a voice/i }).first();
  if (await voiceBtn.isVisible({ timeout: 800 }).catch(() => false)) {
    await voiceBtn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await pickVoice(page, profile).catch(() => null);
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  onProgress?.(`Flow: waiting for ${profile.character} portrait…`);
  await waitForCharacterBuilt(page, profile.character, 180_000);
  await dumpUi(page, "last-character-form-ui.txt");
  await screenshot(page, "last-character-form.png").catch(() => undefined);
  await clickAny(page, [/^done$/i], 2500);
  await page.waitForTimeout(800);
  return true;
}

async function projectUrlFromPage(page) {
  const url = page.url();
  const m = url.match(/^(https:\/\/flow\.google\.com\/project\/[a-z0-9-]+)/i);
  return m ? m[1] : url.replace(/\/character.*$/, "").replace(/\/edit\/.*$/, "");
}

async function createFlowCharacter(page, profile, avatarPath, onProgress) {
  if (!(await openNewCharacterForm(page))) return false;
  if (!(await onCharacterBuilder(page))) return false;
  await dumpUi(page, "last-character-form-ui.txt");
  await screenshot(page, "last-character-form.png").catch(() => undefined);
  const uploaded = await uploadCharacterReference(page, avatarPath);
  await page.waitForTimeout(1200);
  const description = [
    `Name this character "${profile.character}".`,
    "Photoreal person matching the uploaded reference photo exactly — same face, age, beard, skin, and wardrobe.",
    "Do not restyle into a template. Do not invent a different person.",
    profile.characterInfo,
  ]
    .filter(Boolean)
    .join(" ");
  await fillCharacterDescription(page, description);
  await dumpUi(page, "last-character-form-ui.txt");
  await screenshot(page, "last-character-form.png").catch(() => undefined);
  const generate = page.getByRole("button", { name: /start generation/i }).last();
  if (await generate.isVisible({ timeout: 2000 }).catch(() => false)) {
    await generate.click({ timeout: 5000 }).catch(() => undefined);
  } else if (!(await clickAny(page, [/start generation/i], 2000))) {
    return false;
  }
  await page.waitForTimeout(1500);
  const finished = (await characterEditorOpen(page))
    ? await finishCharacterEditor(page, profile, onProgress)
    : await waitForCharacterBuilt(page, profile.character);
  await dumpUi(page, "last-character-library-ui.txt");
  await screenshot(page, "last-character-library.png").catch(() => undefined);
  if (await characterEditorOpen(page)) await finishCharacterEditor(page, profile, onProgress);
  await returnToComposer(page);
  return Boolean(finished);
}

async function ensureFlowCharacter(page, accountId, profile, avatarPath, onProgress) {
  await openAddMenu(page);
  if (await selectCharactersTab(page)) {
    await clearAssetSearch(page);
    const listed = await listVisibleVoices(page);
    const exact = listed.find((name) => String(name || "").toLowerCase() === String(profile.character || "").toLowerCase());
    if (exact) {
      await writeReady(accountId, profile.character, profile.voiceName, { characterReady: true });
      await page.keyboard.press("Escape").catch(() => undefined);
      onProgress?.(`Flow: reusing ${profile.character} character…`);
      return true;
    }
  }
  if (!avatarPath) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return false;
  }
  onProgress?.(`Flow: building ${profile.character} character from avatar…`);
  const created = await createFlowCharacter(page, profile, avatarPath, onProgress);
  if (created) await writeReady(accountId, profile.character, profile.voiceName, { characterReady: true });
  await page.keyboard.press("Escape").catch(() => undefined);
  return created;
}

async function addTrigger(page) {
  return page.getByRole("button", { name: /add ingredients to the prompt box/i }).first();
}

async function isAddMenuOpen(page) {
  const add = await addTrigger(page);
  if ((await add.getAttribute("aria-expanded").catch(() => null)) === "true") return true;
  if (await page.getByPlaceholder(/search assets/i).isVisible({ timeout: 300 }).catch(() => false)) return true;
  if (await page.getByRole("button", { name: /upload media/i }).isVisible({ timeout: 300 }).catch(() => false)) return true;
  return page.getByRole("tab", { name: /^voices$/i }).isVisible({ timeout: 300 }).catch(() => false);
}

async function overlayPane(page) {
  return assetOverlay(page);
}

async function clickInAddMenu(page, names, timeout = 800) {
  const root = await overlayPane(page);
  for (const name of names) {
    if (await visibleClick(root.getByRole("tab", { name }), timeout)) return true;
    if (await visibleClick(root.getByRole("button", { name }), timeout)) return true;
    if (await visibleClick(root.getByRole("menuitem", { name }), timeout)) return true;
    if (await visibleClick(root.getByText(name, { exact: true }), timeout)) return true;
    if (await visibleClick(root.getByText(name, { exact: false }), timeout)) return true;
  }
  return false;
}

async function openAddMenu(page) {
  if (await isAddMenuOpen(page)) return true;
  const add = await addTrigger(page);
  if (!(await add.isVisible({ timeout: 2000 }).catch(() => false))) {
    return clickAny(page, [/add voices/i, /add ingredients/i], 800);
  }
  try {
    await add.click({ timeout: 4000 });
  } catch {
    return isAddMenuOpen(page);
  }
  await page.waitForTimeout(300);
  return isAddMenuOpen(page);
}

async function recoverScripted(page, { kind, isDone, onProgress, name = "", hint = "" } = {}) {
  onProgress?.(`Flow: [recover] ${kind} — scripted, no Gemini`);
  if (await isDone?.()) return true;
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(250);
  if (await isDone?.()) return true;

  if (kind === "attach") {
    await tryAttachNamedCharacter(page, name);
  } else if (kind === "voice") {
    await openAddMenu(page);
    await clickOverlayCategory(page, "voices");
    await clickVoiceRow(page, name);
    await clickAddToPrompt(page);
    await page.keyboard.press("Escape").catch(() => undefined);
  } else if (kind === "open" || kind === "download") {
    await openFinishedClip(page, hint);
  } else if (kind === "generate") {
    await startGenerate(page);
  } else if (kind === "prompt") {
    await focusComposer(page);
  } else {
    await leaveClipEditor(page).catch(() => undefined);
    await clickAny(page, [/all media/i, /^done$/i, /^home$/i], 800);
    await waitForComposer(page).catch(() => undefined);
  }
  return Boolean(await isDone?.());
}


function characterSearchNames(profile) {
  return [...new Set([...(profile?.genderLock ? [] : ["Copy Studio"]), profile?.character, ...(profile?.aliases || [])].filter(Boolean))];
}

async function findLibraryCharacter(page, profile) {
  await openAddMenu(page);
  const tabOk = await selectCharactersTab(page);
  await clearAssetSearch(page);
  if (tabOk) {
    const listed = await listVisibleVoices(page);
    const ranked = rankAvailableCharacters(profile, listed)[0];
    if (ranked) return ranked;
  }
  for (const name of characterSearchNames(profile)) {
    await clearAssetSearch(page);
    if (await searchAssets(page, name)) {
      if (profile.genderLock) {
        const matching = rankAvailableCharacters(profile, await listVisibleVoices(page))[0];
        if (matching) { await clearAssetSearch(page); return matching; }
      } else if (await characterNamedVisible(page, name)) {
        await clearAssetSearch(page);
        return name;
      }
    }
  }
  await clearAssetSearch(page);
  return "";
}

async function resolveLiveIdentity(page, profile, onProgress) {
  await ensureIngredientsMode(page).catch(() => false);
  const character = await findLibraryCharacter(page, profile);
  await openAddMenu(page);
  let voices = [];
  if (await selectVoicesTab(page)) voices = await listVisibleVoices(page);
  const voice = rankAvailableVoices(profile, voices)[0] || "";
  await page.keyboard.press("Escape").catch(() => undefined);

  if (character && character.toLowerCase() !== String(profile.character || "").toLowerCase()) {
    onProgress?.(`Flow: [ok] using character ${character} (no ${profile.character} in Flow)`);
  } else if (!character && profile.character) {
    onProgress?.(`Flow: [warn] no character asset named ${profile.character} — skipping missing attach`);
  }
  if (voice && voice.toLowerCase() !== String(profile.voiceName || "").toLowerCase()) {
    onProgress?.(`Flow: [ok] using voice ${voice} (no ${profile.voiceName} in Flow)`);
  } else if (!voice && profile.voiceName) {
    onProgress?.(`Flow: [warn] no Flow voice matching ${profile.voiceName} — composer will pick`);
  }
  return { character, voice, characters: character ? [character] : [], voices };
}

async function attachIngredients(page, profile, onProgress) {
  const tries = [...new Set([
    String(profile.characterPick || "").trim(),
    String(profile.character || "").trim(),
    ...(profile.genderLock ? [] : ["Copy Studio"]),
  ].filter(Boolean))];
  const voicePick = String(profile.voicePick || profile.voiceName || "").trim();
  onProgress?.(`Flow: [script] attaching ${tries[0] || "no character"} + ${voicePick || "no voice"}`);
  await ensureIngredientsMode(page).catch(() => false);
  await openAddMenu(page);
  await dumpUi(page, "last-add-ui.txt");
  await screenshot(page, "last-add.png").catch(() => undefined);

  const before = await ingredientChipCount(page);
  let characterOk = false;
  let characterAttached = "";
  for (const name of tries) {
    characterOk = await tryAttachNamedCharacter(page, name);
    const afterCharacter = await ingredientChipCount(page);
    characterOk =
      Boolean(characterOk) &&
      ((await characterChipAttached(page, [name])) || afterCharacter > before);
    if (characterOk) {
      characterAttached = name;
      break;
    }
  }
  const afterCharacter = await ingredientChipCount(page);

  const voiceAttached = await pickVoice(page, { ...profile, voicePick, voiceName: voicePick || profile.voiceName });
  const afterVoice = await ingredientChipCount(page);
  const voiceOk =
    Boolean(voiceAttached) &&
    ((await voiceChipAttached(page, [voicePick, voiceAttached, profile.voiceName])) ||
      afterVoice > afterCharacter);

  let imageOk = characterOk;
  if (!characterOk && profile.avatarPath) {
    onProgress?.("Flow: [script] character still missing — uploading avatar image");
    imageOk = await attachAvatarImage(page, profile.avatarPath);
  }

  const readyName = characterAttached || tries[0] || profile.character;
  onProgress?.(
    characterOk || imageOk
      ? `Flow: [ok] ${readyName} ready (${characterOk ? "character chip" : "image"})`
      : `Flow: [warn] no character chip — prompt uses ${readyName || "the spoken copy"}`,
  );
  return { characterOk, imageOk, voiceOk, voiceAttached, characterAttached };
}

async function ensureCustomVoice(page, accountId, profile, onProgress) {
  const ready = await readReady(accountId);
  if (ready?.characters?.[profile.character]?.voiceName === profile.voiceName) return;

  await openAddMenu(page);
  await selectVoicesTab(page);
  await clearAssetSearch(page);
  const voices = await listVisibleVoices(page);
  const wanted = String(profile.voiceName || "").toLowerCase();
  const already = voices.find((name) => String(name || "").toLowerCase() === wanted || String(name || "").toLowerCase().includes(wanted));
  if (already) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await writeReady(accountId, profile.character, profile.voiceName);
    return;
  }
  onProgress?.(`Flow: [voice] ${voices.length} existing voices available; no custom voice named ${profile.voiceName}. Character setup is checked separately.`);
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function generateButton(page) {
  const card = await composerCard(page);
  const scoped = (await card.count()) ? card : page;
  return scoped.getByRole("button", { name: /start generation/i }).last();
}

async function generateEnabled(page) {
  const btn = await generateButton(page);
  if (!(await btn.isVisible({ timeout: 800 }).catch(() => false))) return false;
  if (await btn.isDisabled().catch(() => false)) return false;
  return (await btn.getAttribute("aria-disabled").catch(() => null)) !== "true";
}

async function renderPercents(page) {
  const text = await bodyText(page);
  return [...text.matchAll(/\b(\d{1,3})\s*%/g)].map((m) => Number(m[1])).filter((n) => n >= 0 && n <= 100);
}

async function renderPending(page) {
  return (await renderPercents(page)).filter((n) => n < 100).length;
}

export async function generationDomSnapshot(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const scope = [
      ...document.querySelectorAll(
        "main, [role='main'], [role='dialog'], [role='alert'], [aria-live], [role='progressbar'], flow-grid-tile-container",
      ),
    ].filter(visible);
    const statusText = [...new Set(scope.map((el) => (el.textContent || "").trim()).filter(Boolean))]
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 24_000);
    const percents = [...statusText.matchAll(/\b(\d{1,3})\s*%/g)]
      .map((match) => Number(match[1]))
      .filter((number) => number >= 0 && number <= 100);
    const playButtons = [...document.querySelectorAll("flow-grid-tile-container:has(flow-video-tile), button, [role='button']")].filter((el) => {
      if (el.closest("flow-grid-tile-container") !== el && el.closest("flow-grid-tile-container")) return false;
      const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
      return visible(el) && /play_circle/i.test(label);
    });
    const overlay = document.querySelector(".cdk-overlay-container");
    const mediaCount = [...document.querySelectorAll("img, video, canvas")].filter((el) => {
      if (overlay?.contains(el) || !visible(el)) return false;
      const rect = el.getBoundingClientRect();
      return (
        rect.width >= 96 &&
        rect.height >= 90 &&
        rect.left >= 80 &&
        rect.top >= 40 &&
        rect.bottom <= window.innerHeight - 80
      );
    }).length;
    const generating =
      percents.some((number) => number < 100) ||
      /generating|queued|rendering|working on it|creating your video|processing|in progress/i.test(
        statusText,
      ) ||
      [...document.querySelectorAll("[role='progressbar'], [aria-busy='true']")].some(visible);
    const failedTiles = [...document.querySelectorAll("flow-grid-tile-container")].filter(visible)
      .filter(el => !el.querySelector("flow-character-tile"))
      .map(el => ({ name: (el.getAttribute("aria-label") || "").trim(), message: (el.innerText || "").trim() }))
      .filter(tile => /(?:^|\n)Failed(?:\n|$)|video failed to load|generation failed/i.test(tile.message));
    return {
      failedTiles,
      statusText,
      percents,
      pending: percents.filter((number) => number < 100).length,
      playCount: playButtons.length,
      mediaCount,
      generating,
      playReady: playButtons.length > 0,
    };
  });
}

async function canvasMediaCount(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".cdk-overlay-container");
    return [...document.querySelectorAll("img, video, canvas")].filter((el) => {
      if (overlay?.contains(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 96 || r.height < 90) return false;
      if (r.left < 80 || r.top < 40 || r.bottom > window.innerHeight - 80) return false;
      return true;
    }).length;
  });
}

function clipHint(clipOrId) {
  if (clipOrId && typeof clipOrId === "object") return String(clipOrId.spoken || "").trim();
  return "";
}

function clipLabel(clipOrId) {
  if (clipOrId && typeof clipOrId === "object") return clipOrId.id || "clip";
  return String(clipOrId || "clip");
}

function foldTitle(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/5\s*a\.?\s*m\.?/g, "5am")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchesHint(label, hint) {
  const have = foldTitle(label);
  const want = foldTitle(hint);
  if (!have || !want) return false;
  const needle = want.slice(0, 28);
  const head = have.slice(0, 28);
  return have.includes(needle.slice(0, 22)) || want.includes(head.slice(0, 22));
}

async function anyDownloadControlVisible(page) {
  if (await page.getByRole("button", { name: /download media|download video|download clip|export video/i }).first().isVisible({ timeout: 300 }).catch(() => false)) {
    return true;
  }
  if (await page.getByRole("menuitem", { name: /download|export video/i }).first().isVisible({ timeout: 200 }).catch(() => false)) {
    return true;
  }
  return page.getByRole("button", { name: /^download$/i }).first().isVisible({ timeout: 200 }).catch(() => false);
}

async function inClipEditor(page) {
  if (/\/edit\//.test(page.url())) return true;
  if (await anyDownloadControlVisible(page)) return true;
  return page.locator("video").first().isVisible({ timeout: 250 }).catch(() => false);
}

async function restoreIfBinned(page) {
  const text = await bodyText(page);
  if (!/binned/i.test(text)) return false;
  const restore = page.getByRole("button", { name: /^restore$/i }).first();
  if (await restore.isVisible({ timeout: 800 }).catch(() => false)) {
    await restore.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

function parseDurationSec(text) {
  const m = String(text || "").match(/total duration:\s*(\d{2}):(\d{2}):(\d{2})/i);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export async function editorHasPlayableMedia(page) {
  const video = page.locator("video").first();
  if (await video.isVisible({ timeout: 300 }).catch(() => false)) {
    if (await video.evaluate(el => !el.error && el.readyState >= 2 && Number.isFinite(el.duration) && el.duration > 0.4).catch(() => false)) return true;
  }
  // Flow's canvas editor has no <video>. An enabled export control is its
  // acquisition-ready signal. The downloaded bytes still must pass ffprobe,
  // expected duration, asset identity and speech verification before saving.
  if (!(await page.locator("canvas").first().isVisible({ timeout: 300 }).catch(() => false))) return false;
  const download = page.getByRole("button", { name: /^download media$|^download video$|^download clip$/i }).first();
  return await download.isVisible({ timeout: 300 }).catch(() => false) &&
    await download.isEnabled().catch(() => false) && !(await generationDomSnapshot(page)).generating;
}

async function waitForPlayableMedia(page, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await editorHasPlayableMedia(page)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function leaveClipEditor(page) {
  const url = page.url();
  if (!/\/edit\//.test(url)) return;
  const project = url.replace(/\/edit\/[^/?#]+.*/, "");
  if (/\/project\//.test(project)) {
    await page.goto(project, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  } else {
    await page.goBack({ timeout: 15_000 }).catch(() => undefined);
  }
  await waitForComposer(page);
}

async function playCircleButtons(page) {
  return page.getByRole("button", { name: /play_circle/i });
}

async function playCircleCount(page) {
  return (await generationDomSnapshot(page)).playCount;
}

async function clickTileFromPlay(page, playsBefore = 0) {
  const plays = await playCircleButtons(page);
  const n = await plays.count();
  const added = Math.max(0, n - Math.max(playsBefore, 0));
  const order =
    added > 0
      ? [...Array(added).keys()].map((offset) => playsBefore + offset).reverse()
      : [];
  for (const i of order) {
    const play = plays.nth(i);
    const box = await play.boundingBox().catch(() => null);
    const pt = clickPointFromPlayBadge(box);
    if (!pt) continue;
    await clickXY(page, pt.x, pt.y);
    if (await waitOpened(page, 5000)) return true;
    await page.mouse.dblclick(pt.x, pt.y, { delay: 60 });
    if (await waitOpened(page, 4000)) return true;
  }
  return false;
}

async function gridTileRects(page) {
  const raw = await page.evaluate(() => {
    const overlay = document.querySelector(".cdk-overlay-container");
    const media = [...document.querySelectorAll("img, video, canvas")].filter((el) => {
      if (overlay?.contains(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 80) return false;
      return r.width >= 90 && r.height >= 120 && r.left >= 60 && r.top >= 30;
    });
    media.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    return media.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, top: r.top };
    });
  });
  return raw.filter((r) => isGridClipTile(r));
}

async function clickTileRect(page, r) {
  const x = r.x + r.width * 0.5;
  const y = r.y + r.height * 0.39;
  await clickXY(page, x, y);
}

async function largestTileRect(page) {
  const rects = await gridTileRects(page);
  return rects[rects.length - 1] || rects[0] || null;
}

async function canvasTileCenter(page) {
  const r = await largestTileRect(page);
  if (!r) return null;
  return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.38 };
}

async function clickLargestTileImage(page) {
  const pt = await canvasTileCenter(page);
  if (!pt) return false;
  await clickXY(page, pt.x, pt.y);
  if (await waitOpened(page, 6000)) return true;
  await page.mouse.dblclick(pt.x, pt.y, { delay: 60 });
  if (await waitOpened(page, 5000)) return true;
  await page.keyboard.press("Enter").catch(() => undefined);
  return waitOpened(page, 3000);
}

async function clickCanvasClip(page) {
  const pt = await canvasTileCenter(page);
  if (!pt) return false;
  await clickXY(page, pt.x, pt.y);
  return true;
}

async function findEditHrefs(page) {
  return page.evaluate(() => {
    const urls = new Set();
    for (const a of document.querySelectorAll("a[href*='/edit/']")) {
      if (a.href) urls.add(a.href);
    }
    const html = document.documentElement.innerHTML;
    const re = /\/project\/[a-f0-9-]+\/edit\/[a-f0-9-]+/gi;
    let m;
    while ((m = re.exec(html))) {
      urls.add(new URL(m[0], location.origin).href);
    }
    return [...urls];
  });
}

async function gotoFirstEditHref(page) {
  const hrefs = await findEditHrefs(page);
  if (!hrefs.length) return false;
  await page.goto(hrefs[0], { waitUntil: "domcontentloaded", timeout: 30_000 });
  return /\/edit\//.test(page.url());
}

export async function listClipTitleButtons(page) {
  // Take one DOM snapshot: Flow can remove editor controls while hydrating.
  // Iterating live nth() locators then waits a full timeout for each vanished button.
  return page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const out = [];
    const tiles = [...document.querySelectorAll("flow-grid-tile-container[aria-label]:has(flow-video-tile)")];
    tiles.forEach((tile,index) => {
      const name = (tile.getAttribute("aria-label") || "").trim();
      if (!visible(tile)) return; // Flow can publish a playable clip before naming it.
      const box = tile.getBoundingClientRect();
      out.push({name,index,x:box.x,y:box.y});
    });
    return out;
  });
}

function rankClipTargets(titles, hint, titlesBefore = []) {
  const fresh = newClipTitles(titlesBefore, titles);
  const pool = fresh.length ? fresh : titles;
  return pool
    .map((t) => ({ ...t, score: scoreAutoTitle(t.name, hint), fresh: fresh.length > 0 }))
    .sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
}

export async function clickNamedClipTitle(page, name, occurrence = 0) {
  let matched = 0;
  const tiles = page.locator("flow-grid-tile-container[aria-label]:has(flow-video-tile)");
  for (let i = 0; i < await tiles.count(); i++) {
    const tile = tiles.nth(i);
    if ((await tile.getAttribute("aria-label"))?.trim() !== name) continue;
    if (!(await tile.isVisible())) continue;
    if (matched++ !== occurrence) continue;
    // Stay above the hover actions/footer so this opens the video itself.
    const box = await tile.boundingBox();
    if (!box) continue;
    await tile.click({ position: { x: box.width / 2, y: box.height * 0.35 }, timeout: 4000 });
    return true;
  }
  const buttons = page.getByRole("button");
  const n = await buttons.count();
  for (let i = 0; i < Math.min(n, 160); i++) {
    const btn = buttons.nth(i);
    const label = `${(await btn.getAttribute("aria-label").catch(() => "")) || ""} ${(await btn.innerText().catch(() => "")) || ""}`;
    if (foldTitle(label) !== foldTitle(name) && !titleMatchesHint(label, name)) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    if (matched++ !== occurrence) continue;
    try {
      await btn.click({ timeout: 4000 });
      return true;
    } catch {
      await btn.click({ force: true, timeout: 2000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function clickClipTitle(page, hint, { hintOnly = false, titlesBefore = [] } = {}) {
  const titles = await listClipTitleButtons(page);
  const ranked = rankClipTargets(titles, hint, titlesBefore);
  const picks = hintOnly ? ranked.filter((t) => t.fresh || t.score >= 1) : ranked;
  for (const pick of picks.slice(0, 6)) {
    if (await clickNamedClipTitle(page, pick.name)) return true;
  }
  return false;
}

async function waitOpened(page, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await restoreIfBinned(page);
    if (/\/edit\//.test(page.url()) || (await inClipEditor(page)) || (await editorHasPlayableMedia(page))) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  await restoreIfBinned(page);
  return editorHasPlayableMedia(page) || inClipEditor(page);
}

async function hasCreditsWarningIcon(page) {
  return page
    .evaluate(() => {
      const els = [...document.querySelectorAll("[aria-label]")];
      return els.some((el) => /insufficient credit|out of credit|no credits? left/i.test(el.getAttribute("aria-label") || ""));
    })
    .catch(() => false);
}

async function waitForGenerateEnabled(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  if (await generateEnabled(page)) return { enabled: true };
  while (Date.now() < deadline) {
    // Flow sometimes replaces the send control with a warning icon instead of
    // disabling it; that reason lives only in the icon's aria-label, never in
    // the page's visible text, so bodyText()-based credit checks miss it.
    if (await hasCreditsWarningIcon(page)) return { enabled: false, creditsWarning: true };
    await pause(page, 400);
    if (await generateEnabled(page)) return { enabled: true };
  }
  return { enabled: false, creditsWarning: await hasCreditsWarningIcon(page) };
}

async function startGenerate(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await think(page);
  // Flow's own UI can take a few seconds to re-validate the button after we
  // attach ingredients and fill the prompt; poll instead of a single check so
  // we don't fail (and blindly redo all that work) on a transient disabled state.
  const wait = await waitForGenerateEnabled(page, 8_000);
  if (wait.creditsWarning) {
    // Confirmed by observation: this icon has appeared on brand-new projects'
    // very first clip, not just a stuck resumed one, while the account's own
    // credit probe still reports a healthy balance. That rules out both "this
    // account is really empty" and "only this one project is stuck" — it
    // looks like a temporary Flow-side hold from heavy recent usage on the
    // account. Fail this clip clearly without marking the account out of
    // credits (that would be wrong too — it's not a balance problem).
    throw Object.assign(
      new Error(
        "Flow's composer shows a cost warning icon and will not start this generation, though this account's balance checks out fine elsewhere. This has now happened on brand-new projects too, so it looks like a temporary Flow-side hold from heavy recent usage on this account, not a real credits shortfall or one stuck project. Retrying immediately on this account will likely hit the same wall — wait a while before using it again, or use a different account.",
      ),
      { code: "PROJECT_CREDITS_WARNING" },
    );
  }
  if (wait.enabled) {
    const start = await generateButton(page);
    try {
      await clickLocator(start, { timeout: 4000 });
      await pause(page, 450);
      return true;
    } catch {
      try {
        await start.click({ force: true, timeout: 2000 });
        await pause(page, 400);
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

export async function waitForOutput(
  page,
  onProgress,
  clipOrId,
  mediaBefore = 0,
  pendingBefore = 0,
  playsBefore = 0,
  deadline = 0,
  catcher = null,
  titlesBefore = [],
  editHrefsBefore = [],
  observationDeadline = 0,
) {
  const started = Date.now();
  const limit = observationDeadline ? Math.max(0, observationDeadline - started) : 10 * 60 * 1000;
  const bootDeadline = Date.now() + 45_000;
  const hint = clipHint(clipOrId);
  const label = clipLabel(clipOrId);
  let sawProgress = false;
  let lastNote = "";
  let lastPct = -1;
  let lastMoveAt = 0;
  let stallNoted = false;
  let lastFullGuardAt = 0;
  let pageReloads = 0;
  let lastReloadAt = started;
  let lastAssetInspectionAt = 0;
  while (Date.now() - started < limit) {
    if (deadline && Date.now() > deadline) {
      throw Object.assign(new Error(JOB_TIMEOUT_MESSAGE), { code: "TIMEOUT" });
    }
    const snapshot = await generationDomSnapshot(page);
    let guardText = snapshot.statusText;
    if (Date.now() - lastFullGuardAt >= 15_000) {
      guardText = `${guardText} ${await bodyText(page)}`;
      lastFullGuardAt = Date.now();
    }
    if (looksOutOfCredits(guardText)) throw Object.assign(new Error(OUT_OF_CREDITS), { code: "CREDITS" });
    if (looksFlowBlocked(guardText)) throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
    if (looksSignedOut(page.url(), guardText)) throw Object.assign(new Error(SESSION_EXPIRED), { code: "EXPIRED" });
    const failure = newRenderFailure(snapshot, titlesBefore);
    if (failure && pageReloads >= 2) {
      await failUi(page, Object.assign(new Error(`Flow: ${label} could not load its submitted clip after two page reloads. ${failure.message.replace(/\s+/g, " ").slice(0, 240)} No replacement generation was submitted.`), { code: "MEDIA_LOAD_FAILED", dispatched: true }));
    }
    if (pageReloads < 2 && (failure || Date.now() - Math.max(lastMoveAt, lastReloadAt) > 90000)) {
      pageReloads += 1;
      onProgress?.(`Flow: [recover] ${label} reloading the video service to recover the submitted clip (${pageReloads}/2) — no new generation`);
      const project = page.url().replace(/\/edit\/[^/?#]+.*/, "");
      await page.goto(project, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      lastReloadAt = Date.now();
      continue;
    }

    const pending = snapshot.pending;
    const pct = snapshot.percents.filter((n) => n < 100);
    const morePlays = snapshot.playCount > playsBefore;
    const moreMedia = snapshot.mediaCount > mediaBefore;
    if (pending > pendingBefore || snapshot.generating || morePlays || moreMedia) {
      sawProgress = true;
    }
    if (sawProgress) {
      if (!lastMoveAt) lastMoveAt = Date.now();
      if (pct.length) {
        const max = Math.max(...pct);
        if (max !== lastPct) {
          lastPct = max;
          lastMoveAt = Date.now();
        }
      }
      const note = renderReadyToOpen(snapshot, playsBefore)
        ? `Flow: [script] ${label} waiting for the new clip player to load`
        : pct.length
          ? `Flow: [script] ${label} rendering ${Math.max(...pct)}%`
          : `Flow: [script] ${label} rendering`;
      if (note !== lastNote) {
        lastNote = note;
        onProgress?.(note);
      }
      if (Date.now() - lastMoveAt > 150_000) {
        if (!stallNoted) {
          stallNoted = true;
          onProgress?.(
            `Flow: [recover] ${label} progress text paused — still watching this render, not generating again`,
          );
        }
      }
    }

    // A thumbnail or old play icon is not a completed generation. Return only
    // after opening a distinct new asset with playable media; never latch a
    // transient grid signal or hand an unfinished render to download retries.
    // Old tiles can fail to load, so the total play count need not increase.
    // Inspect against saved asset IDs periodically; title/count changes are hints only.
    const identityInspectionDue = editHrefsBefore.length >= playsBefore &&
      snapshot.playReady && !snapshot.generating && snapshot.pending === 0 &&
      Date.now() - lastAssetInspectionAt >= 30_000;
    if ((sawProgress && renderReadyToOpen(snapshot, playsBefore)) || identityInspectionDue) {
      lastAssetInspectionAt = Date.now();
      const opened = await openFinishedClip(page, hint, playsBefore, titlesBefore, editHrefsBefore, mediaBefore, catcher);
      if (opened) {
        catcher?.freeze?.();
        onProgress?.(`Flow: [script] ${label} finished, opened verified new clip`);
        return;
      }
    }

    if (!sawProgress && Date.now() > bootDeadline) {
      if (
        snapshot.pending > pendingBefore ||
        snapshot.generating ||
        snapshot.mediaCount > mediaBefore ||
        snapshot.playCount > playsBefore
      ) {
        sawProgress = true;
      } else {
        const note = `Flow: [recover] ${label} waiting for the submitted clip to appear — no new generation`;
        if (lastNote !== note) { onProgress?.(note); lastNote = note; }
      }
    }
    await pause(page, pollPauseMs());
  }
  await failUi(
    page,
    Object.assign(
      new Error(`Flow: ${label} was submitted but its video is still unavailable after the shared 10-minute observation window. Saved clips are preserved; no replacement generation was submitted.`),
      { code: "RENDER_UNAVAILABLE", dispatched: true },
    ),
  );
}

async function clickDownloadControl(page) {
  const names = [
    /download media/i,
    /download video/i,
    /download clip/i,
    /export video/i,
    /export media/i,
    /^download$/i,
    /^export$/i,
    /download/i,
  ];
  for (const name of names) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
      await btn.click({ timeout: 4000 }).catch(async () => {
        await btn.click({ force: true, timeout: 2000 });
      });
      return true;
    }
    const item = page.getByRole("menuitem", { name }).first();
    if (await item.isVisible({ timeout: 300 }).catch(() => false)) {
      await item.click({ timeout: 4000 }).catch(() => undefined);
      return true;
    }
  }
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, [role='button'], a, [role='menuitem']")].find((el) => {
      const hay = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`;
      return /download|export video/i.test(hay) && !/download chrome|download the app/i.test(hay);
    });
    btn?.click();
    return Boolean(btn);
  });
}

async function pickDownloadQuality(page) {
  for (const name of [/^1080p$/i, /1080\s*p/i, /1080p upscaled/i, /original size/i, /^720p$/i, /720\s*p/i, /^360p$/i]) {
    for (const role of ["menuitem", "option", "button", "radio"]) {
      const el = page.getByRole(role, { name }).first();
      if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => undefined);
        return true;
      }
    }
  }
  return false;
}

function looksLikeVideoResponse(res) {
  const url = res.url();
  const ct = (res.headers()["content-type"] || "").toLowerCase();
  const cd = (res.headers()["content-disposition"] || "").toLowerCase();
  if (!res.ok()) return false;
  if (/video\/(mp4|webm|quicktime)/i.test(ct)) return true;
  if (/\.mp4(\?|$)/i.test(url) || /\.mp4["']/i.test(cd)) return true;
  return false;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function createMediaCatcher(page, { banned } = {}) {
  const hits = [];
  const startedAt = Date.now();
  let renderedAt = null;
  let openedAt = null;
  let openedAssetId = "";
  let lastSaved = null;
  const bannedSet = banned || new Set();
  const onRes = (res) => {
    if (looksLikeVideoResponse(res)) hits.push({ res, at: Date.now(), url: res.url() });
  };
  page.on("response", onRes);
  async function ranked({ since = startedAt, afterOpenOnly = false } = {}) {
    let pool;
    if (afterOpenOnly) {
      pool = openedAt ? hits.filter((h) => h.at >= openedAt) : [];
    } else if (openedAt) {
      const afterOpen = hits.filter((h) => h.at >= openedAt);
      pool = afterOpen.length ? afterOpen : hits.filter((h) => h.at >= since);
    } else {
      pool = hits.filter((h) => h.at >= since);
    }
    const out = [];
    const seen = new Set();
    for (const hit of pool) {
      const body = await hit.res.body().catch(() => null);
      if (!body || body.length < MIN_CLIP_BYTES) continue;
      const hash = sha256(body);
      if (seen.has(hash) || bannedSet.has(hash)) continue;
      seen.add(hash);
      const candidate = { body, at: hit.at, len: body.length, hash, url: hit.url };
      if (
        afterOpenOnly &&
        !candidateMatchesAsset(candidate, { assetId: openedAssetId, openedAt })
      ) {
        continue;
      }
      out.push(candidate);
    }
    out.sort((a, b) => b.at - a.at || b.len - a.len);
    return out;
  }
  return {
    startedAt,
    get openedAt() {
      return openedAt;
    },
    get openedAssetId() {
      return openedAssetId;
    },
    get renderedAt() {
      return renderedAt;
    },
    get lastSaved() {
      return lastSaved;
    },
    freeze() {
      if (renderedAt == null) renderedAt = Date.now();
    },
    markOpened(assetOrUrl = "") {
      const id = assetIdFromEditUrl(assetOrUrl) || String(assetOrUrl || "").toLowerCase();
      if (!id) return false;
      openedAssetId = id;
      if (openedAt == null) openedAt = Date.now();
      return true;
    },
    ban(hash) {
      if (hash) bannedSet.add(hash);
    },
    markSaved(hit) {
      if (!hit) return;
      lastSaved = {
        at: hit.at,
        hash: hit.hash,
        len: hit.len,
        url: hit.url,
        assetId: openedAssetId,
      };
    },
    ranked,
    async save(destPath, { since = startedAt, afterOpenOnly = false, minMs } = {}) {
      for (const hit of await ranked({ since, afterOpenOnly })) {
        await writeFile(destPath, hit.body);
        const take = await isPlayableTake(
          destPath,
          minMs ? { minMs } : undefined,
        );
        if (take.ok) {
          lastSaved = {
            at: hit.at,
            hash: hit.hash,
            len: hit.len,
            url: hit.url,
            assetId: openedAssetId,
          };
          return destPath;
        }
      }
      return null;
    },
    off() {
      page.off("response", onRes);
    },
  };
}

function attachVideoSniffer(page) {
  return createMediaCatcher(page);
}

async function playEditorPreview(page) {
  const play = page.getByRole("button", { name: /^play$/i }).first();
  if (await play.isVisible({ timeout: 600 }).catch(() => false)) {
    await play.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function saveVideoSrc(page, destPath) {
  const src = await page
    .locator("video")
    .first()
    .evaluate((v) => v.currentSrc || v.src || "")
    .catch(() => "");
  if (!src) return null;
  if (/^https?:/i.test(src)) {
    const res = await page.request.get(src, { timeout: 20_000 }).catch(() => null);
    if (res?.ok()) {
      await writeFile(destPath, await res.body());
      return destPath;
    }
  }
  if (src.startsWith("blob:")) {
    const b64 = await page
      .evaluate(async (url) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20_000);
        try {
          const res = await fetch(url, { signal: ctrl.signal });
          if (!res.ok) return null;
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return btoa(bin);
        } finally {
          clearTimeout(timer);
        }
      }, src)
      .catch(() => null);
    if (b64) {
      await writeFile(destPath, Buffer.from(b64, "base64"));
      return destPath;
    }
  }
  return null;
}

async function editorMatchesHint(page, hint) {
  if (!hint) return true;
  return titleMatchesHint(await bodyText(page), hint);
}

async function dismissMenus(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape").catch(() => undefined);
}

export async function openFinishedClip(
  page,
  hint = "",
  playsBefore = 0,
  titlesBefore = [],
  editHrefsBefore = [],
  mediaBefore = 0,
  catcher = null,
) {
  const beforeIds = new Set(editHrefsBefore.map(assetIdFromEditUrl).filter(Boolean));
  const acceptOpened = async () => {
    if (!(await waitOpened(page, 5000))) return null;
    const url = page.url();
    const assetId = assetIdFromEditUrl(url);
    if (!assetId || beforeIds.has(assetId) || !(await waitForPlayableMedia(page))) return null;
    catcher?.markOpened?.(url);
    return { assetId, url, openedAt: Date.now() };
  };

  await dismissMenus(page);
  if (/\/edit\//.test(page.url())) {
    await restoreIfBinned(page);
    const currentAssetId = assetIdFromEditUrl(page.url());
    if (
      currentAssetId &&
      !beforeIds.has(currentAssetId) &&
      (currentAssetId === catcher?.openedAssetId || !hint || (await editorMatchesHint(page, hint))) &&
      (await waitForPlayableMedia(page))
    ) {
      catcher?.markOpened?.(page.url());
      return { assetId: currentAssetId, url: page.url(), openedAt: Date.now() };
    }
    await leaveClipEditor(page);
  }

  const projectUrl = page.url();
  const freshAsset = identifyNewEditAsset(editHrefsBefore, await findEditHrefs(page), projectUrl);
  if (freshAsset) {
    await page.goto(freshAsset.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const opened = await acceptOpened();
    if (opened) return opened;
    if (await inClipEditor(page)) await leaveClipEditor(page);
  }

  const titles = await listClipTitleButtons(page);
  const freshTitles = newClipTitles(titlesBefore, titles);
  const rankedFresh = freshTitles
    .map((title) => ({ ...title, score: scoreAutoTitle(title.name, hint) }))
    .sort((a, b) => b.score - a.score || b.y - a.y || b.x - a.x);
  for (const pick of rankedFresh.slice(0, 3)) {
    if (!(await clickNamedClipTitle(page, pick.name))) continue;
    const opened = await acceptOpened();
    if (opened) return opened;
    if (await inClipEditor(page)) await leaveClipEditor(page);
  }

  // Flow can reuse the same truncated auto-title. With all prior assets known,
  // inspect each matching tile and reject old IDs instead of trusting its name.
  if (playsBefore > 0 && beforeIds.size >= playsBefore) {
    const occurrences = new Map();
    for (const pick of titles) {
      const occurrence = occurrences.get(pick.name) || 0;
      occurrences.set(pick.name, occurrence + 1);
      if (!(await clickNamedClipTitle(page, pick.name, occurrence))) continue;
      const opened = await acceptOpened();
      if (opened) return opened;
      if (await inClipEditor(page)) await leaveClipEditor(page);
    }
  }

  if (await clickTileFromPlay(page, playsBefore)) {
    const opened = await acceptOpened();
    if (opened) return opened;
    if (await inClipEditor(page)) await leaveClipEditor(page);
  }

  // Coordinate fallback is safe only for the first tile in an empty,
  // job-scoped project. It never chooses among existing tiles.
  const rects = await gridTileRects(page);
  if (
    rects.length &&
    playsBefore === 0 &&
    mediaBefore === 0 &&
    titlesBefore.length === 0 &&
    editHrefsBefore.length === 0
  ) {
    const r = rects[rects.length - 1];
    await clickTileRect(page, r);
    const opened = await acceptOpened();
    if (opened) return opened;
    await page.mouse.dblclick(r.x + r.width * 0.5, r.y + r.height * 0.38);
    const openedAgain = await acceptOpened();
    if (openedAgain) return openedAgain;
    if (await inClipEditor(page)) await leaveClipEditor(page);
  }
  return null;
}

async function moreButtonsNear(page, tile) {
  const buttons = page.getByRole("button", { name: /more_vert|more options|more actions|overflow/i });
  const n = await buttons.count();
  const hits = [];
  for (let i = 0; i < n; i++) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible({ timeout: 150 }).catch(() => false))) continue;
    const box = await btn.boundingBox().catch(() => null);
    if (!box) continue;
    if (tile) {
      const nearX = box.x >= tile.x - 24 && box.x <= tile.x + tile.width + 36;
      const nearY = box.y >= tile.y - 24 && box.y <= tile.y + tile.height + 48;
      if (!nearX || !nearY) continue;
    }
    hits.push(btn);
  }
  return hits;
}

async function openTileOverflow(page) {
  const rects = await gridTileRects(page);
  const tiles = rects.length ? rects.slice(-3).reverse() : [null];
  for (const tile of tiles) {
    if (tile) {
      await page.mouse.move(tile.x + tile.width * 0.82, tile.y + 18);
      await page.waitForTimeout(150);
    }
    for (const btn of await moreButtonsNear(page, tile)) {
      await btn.click({ timeout: 3000 }).catch(() => btn.click({ force: true, timeout: 1500 }).catch(() => undefined));
      await page.waitForTimeout(300);
      if (await anyDownloadControlVisible(page)) return true;
      if (await clickDownloadControl(page)) return true;
    }
  }
  return false;
}

async function downloadFromTileMenu(page, destPath, catcher, minMs = 3_000) {
  const waiter = page.waitForEvent("download", { timeout: 12_000 }).catch(() => null);
  if (!(await openTileOverflow(page)) && !(await clickDownloadControl(page))) {
    return catcher?.save(destPath, { afterOpenOnly: true, minMs }) || null;
  }
  await page.waitForTimeout(400);
  await pickDownloadQuality(page);
  const download = await waiter;
  if (download) {
    await download.saveAs(destPath);
    return destPath;
  }
  return (
    (await catcher?.save(destPath, { afterOpenOnly: true, minMs })) ||
    saveVideoSrc(page, destPath)
  );
}

async function harvestEditorVideo(page, destPath, catcher, since, minMs = 3_000) {
  const owned = catcher ? null : createMediaCatcher(page);
  const sniffer = catcher || owned;
  const opts = since != null ? { since } : undefined;
  const strictOpts = sniffer.openedAssetId
    ? { ...(opts || {}), afterOpenOnly: true, minMs }
    : { ...(opts || {}), minMs };
  try {
    const already = await sniffer.save(destPath, {
      ...opts,
      afterOpenOnly: Boolean(sniffer.openedAt),
    });
    if (already) return already;
    await restoreIfBinned(page);
    await playEditorPreview(page);
    await page.waitForTimeout(1200);
    const fromPreview =
      (await saveVideoSrc(page, destPath)) ||
      (await sniffer.save(destPath, strictOpts));
    if (fromPreview) return fromPreview;

    const waiter = page.waitForEvent("download", { timeout: 12_000 }).catch(() => null);
    const clicked =
      (await clickDownloadControl(page)) ||
      (await clickAny(page, [/download media/i, /download video/i, /export video/i, /^download$/i], 800));
    if (!clicked) return sniffer.save(destPath, strictOpts);
    await page.waitForTimeout(500);
    await pickDownloadQuality(page);
    const download = await waiter;
    if (download) {
      await download.saveAs(destPath);
      return destPath;
    }
    const href = await page.locator('a[href*=".mp4"], a[download]').first().getAttribute("href").catch(() => null);
    if (href && /^https?:/i.test(href)) {
      const res = await page.request.get(href, { timeout: 20_000 }).catch(() => null);
      if (res?.ok()) {
        const body = await res.body();
        if (body.length >= MIN_CLIP_BYTES) {
          await writeFile(destPath, body);
          return destPath;
        }
      }
    }
    return (
      (await saveVideoSrc(page, destPath)) ||
      sniffer.save(destPath, strictOpts)
    );
  } finally {
    owned?.off();
  }
}

async function download1080(
  page,
  destPath,
  hint = "",
  onProgress,
  catcher,
  since,
  playsBefore = 0,
  titlesBefore = [],
  editHrefsBefore = [],
  mediaBefore = 0,
  minMs = 3_000,
) {
  await dismissMenus(page);
  const already = await catcher?.save(destPath, {
    ...(since != null ? { since } : {}),
    afterOpenOnly: true,
    minMs,
  });
  if (already) {
    onProgress?.("Flow: [ok] saved the rendered MP4 from the network");
    return already;
  }
  const deadline = Date.now() + 75_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() > deadline) break;
    onProgress?.(`Flow: [script] download attempt ${attempt + 1}/3`);
    if (catcher?.openedAssetId) {
      // Once identified, only reopen this exact asset. Grid controls can change
      // while a download fails and must never become a new selection target.
      const target = checkpointAssetUrl({assetId:catcher.openedAssetId}, page.url());
      if (assetIdFromEditUrl(page.url()) !== catcher.openedAssetId && target) {
        await page.goto(target,{waitUntil:"domcontentloaded",timeout:30000});
      }
      if (assetIdFromEditUrl(page.url()) !== catcher.openedAssetId || !(await waitForPlayableMedia(page))) {
        await page.waitForTimeout(500);
        continue;
      }
    } else {
      await openFinishedClip(page,hint,playsBefore,titlesBefore,editHrefsBefore,mediaBefore,catcher);
    }
    if (!catcher?.openedAssetId) {
      const titles = await listClipTitleButtons(page);
      const picks = rankClipTargets(titles, hint, titlesBefore).slice(0, 4);
      onProgress?.(
        picks.length
          ? `Flow: [script] new clip tile not open yet — see ${picks.map((t) => t.name).join("; ")}`
          : "Flow: [script] new clip tile not open yet",
      );
      await page.waitForTimeout(600);
      continue;
    }
    await restoreIfBinned(page);
    const saved = await harvestEditorVideo(page, destPath, catcher, since, minMs);
    if (saved) return saved;
    onProgress?.("Flow: [script] no editor MP4 yet — trying the tile menu");
    const fromMenu = await downloadFromTileMenu(page, destPath, catcher, minMs);
    if (fromMenu) return fromMenu;
    await page.waitForTimeout(400);
  }
  await dumpUi(page, "last-download-ui.txt").catch(() => undefined);
  await screenshot(page, "last-download.png").catch(() => undefined);
  onProgress?.("Flow: [warn] could not pull the MP4 from Flow in 75s");
  if (!catcher?.openedAssetId) return null;
  return (
    (await catcher.save(destPath, { afterOpenOnly: true, minMs })) ||
    saveVideoSrc(page, destPath)
  );
}

async function materializeAvatar(avatarUrl, destDir) {
  if (!avatarUrl) return null;
  const dest = join(destDir, "avatar.jpg");
  if (String(avatarUrl).startsWith("data:")) {
    const m = String(avatarUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    await writeFile(dest, Buffer.from(m[2], "base64"));
    return dest;
  }
  const res = await fetch(avatarUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

export async function withAccountPage(accountId, storageState, fn, { flush = true } = {}) {
  const persist = accountId && (await hasChromeProfile(accountId));
  if (persist) {
    await unlockProfile(accountId);
    const context = await chromium.launchPersistentContext(profileDir(accountId), sessionChrome());
    // The plugin hooks attach to new pages, not Chromium's restored startup tab.
    const page = await context.newPage();
    try {
      return await fn(page, context);
    } finally {
      if (flush) await flushProject(page).catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }
  const chrome = sessionChrome();
  const browser = await chromium.launch({ executablePath: process.env.FLOW_CHROME_PATH || undefined, headless: chrome.headless, args: chrome.args });
  try {
    const context = await browser.newContext({
      storageState,
      viewport: chrome.viewport,
      acceptDownloads: true,
      locale: chrome.locale,
      timezoneId: chrome.timezoneId,
    });
    const page = await context.newPage();
    try {
      return await fn(page, context);
    } finally {
      if (flush) await flushProject(page).catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function setupFlowCharacter(accountId, storageState, input = {}, { onProgress } = {}) {
  return withAccountPage(accountId, storageState, async (page, context) => {
    const profile = resolveFlowVoice({
      name: input.personaName,
      handle: input.personaHandle,
      voiceName: input.voiceName,
      characterGender: input.characterGender,
    });
    onProgress?.(`Flow: opening ${profile.character}…`);
    const ready = await readReady(accountId);
    const savedProject =
      ready?.characters?.[profile.character]?.projectUrl ||
      "https://flow.google.com/project/32ac2cab-1893-492c-86d8-9e5b18ca4a89";
    await page.goto(savedProject, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForComposer(page);
    const session = await detectSession(page, context);
    try {
      const newHome = await isNewFlowHome(page);
      if (!newHome && !/\/project\//.test(page.url())) {
        await clickAny(page, [/new project/i, /^create$/i, /^video$/i], 3000);
        await waitForComposer(page);
      }
      await agentOff(page);
      await page.keyboard.press("Escape").catch(() => undefined);
      await clickSidebarCharacters(page);
      await page.waitForTimeout(1000);
      await dumpUi(page, "last-character-library-ui.txt");
      await screenshot(page, "last-character-library.png").catch(() => undefined);
      let listed = await characterListedInLibrary(page, profile.character);
      if (!listed) {
        let opened = await openLibraryCharacter(page, [profile.character, "Untitled character"]);
        if (!opened && !(await characterEditorOpen(page))) {
          onProgress?.(`Flow: building ${profile.character} character from avatar…`);
          opened = await createFlowCharacter(page, profile, input.avatarPath || null, onProgress);
        }
        if (await characterEditorOpen(page)) {
          await finishCharacterEditor(page, profile, onProgress);
        }
        await returnToComposer(page);
        await clickSidebarCharacters(page);
        await page.waitForTimeout(800);
        listed =
          (await characterListedInLibrary(page, profile.character)) ||
          (await characterListedInLibrary(page, "Untitled character"));
        await dumpUi(page, "last-character-library-ui.txt");
        await screenshot(page, "last-character-library.png").catch(() => undefined);
      } else {
        onProgress?.(`Flow: reusing ${profile.character} character…`);
      }
      await returnToComposer(page);
      onProgress?.(`Flow: attaching ${profile.character} to the prompt…`);
      let characterOk = await tryAttachNamedCharacter(page, profile.character);
      if (!characterOk) characterOk = await tryAttachNamedCharacter(page, profile.character);
      characterOk = characterOk || (await characterChipAttached(page, [profile.character, "Untitled character"]));
      await ensureCustomVoice(page, accountId, profile, onProgress);
      const voiceAttached = await pickVoice(page, profile);
      const voiceOk =
        Boolean(voiceAttached) || (await voiceChipAttached(page, [profile.voiceName, profile.character]));
      await dumpUi(page, "last-character-ui.txt");
      await screenshot(page, "last-character.png").catch(() => undefined);
      if (!characterOk) {
        onProgress?.("Flow: [recover] character not on composer — watching the page");
        characterOk = await recoverScripted(page, {
          kind: "attach",
          name: profile.character,
          isDone: () => characterChipAttached(page, [profile.character, "Untitled character"]),
          onProgress,
        });
      }
      if (!characterOk) {
        onProgress?.("Flow: [warn] character chip missing — prompt still names the person, continuing");
      }
      await writeReady(accountId, profile.character, profile.voiceName, {
        characterReady: true,
        projectUrl: await projectUrlFromPage(page),
      });
      return {
        character: profile.character,
        voiceName: profile.voiceName,
        email: session.email,
        credits: session.credits,
        listed,
        characterOk,
        voiceOk,
      };
    } catch (err) {
      await dumpUi(page, "last-character-ui.txt").catch(() => undefined);
      await screenshot(page, "last-character.png").catch(() => undefined);
      throw err;
    }
  });
}

export async function probeAccount(storageState, _accountId) {
  if (!storageState) throw Object.assign(new Error(SESSION_EXPIRED), { code: "EXPIRED" });
  const browser = await chromium.launch({ executablePath: process.env.FLOW_CHROME_PATH || undefined, headless: HEADLESS, args: chromeArgs() });
  try {
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();
    try {
      await page.goto(FLOW_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(900);
      const url = page.url();
      const text = await bodyText(page);
      await dumpUi(page, "last-probe-ui.txt").catch(() => undefined);
      await screenshot(page, "last-probe.png").catch(() => undefined);
      if (looksSignedOut(url, text)) throw Object.assign(new Error(SESSION_EXPIRED), { code: "EXPIRED" });
      if (looksFlowBlocked(text)) throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
      if (looksOutOfCredits(text)) throw Object.assign(new Error(OUT_OF_CREDITS), { code: "CREDITS" });
      // A session can land on Flow's public marketing/landing page (e.g.
      // flow.google.com/about) instead of the signed-in app without matching
      // any Google-login interstitial pattern above. That page's own
      // marketing/pricing copy can coincidentally contain "N credits" text,
      // which would otherwise be misreported as this account's real balance.
      if (!looksLoggedInToFlow(url, text)) {
        throw Object.assign(
          new Error(`Flow session appears signed out (redirected to ${url}). Reconnect this account in Settings.`),
          { code: "EXPIRED" },
        );
      }
      let credits = parseCreditsFromText(text);
      if (credits == null) {
        await clickAny(page, [/\d+\s*credits?/i, /credits remaining/i], 1200);
        credits = parseCreditsFromText(await bodyText(page));
      }
      return { ok: true, credits, email: null, status: credits === 0 ? "no_credits" : "connected" };
    } catch (err) {
      await screenshot(page).catch(() => undefined);
      throw err;
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function projectIdFromFlowUrl(url) {
  return String(url || "").match(/flow\.google\.com\/project\/([0-9a-f-]{36})/i)?.[1] || null;
}

async function generateReelWithRpc({
  page,
  accountId,
  clips,
  profile,
  speechKeys,
  session,
  downloadDir,
  onProgress,
  onDispatched,
  jobDeadline,
}) {
  const projectId = projectIdFromFlowUrl(page.url());
  if (!projectId) {
    throw Object.assign(
      new Error("Flow RPC mode needs a saved project. Run character setup once, then retry."),
      { code: "RPC" },
    );
  }

  onProgress?.("Flow: [rpc] reading saved characters and voices — no composer clicks");
  const client = createFlowRpcClient(page, { projectId });
  const inventory = await client.inventory();
  const candidates = profile.genderLock ? inventory.characters.filter(c => assetGender(c.displayName, FLOW_VOICE_PROFILES) === profile.genderLock) : inventory.characters;
  const character = resolveCharacter(candidates, profile.character, { allowSole: true });
  if (!character?.entityId) {
    throw Object.assign(
      new Error(`Flow RPC mode could not find the saved ${profile.character} character in this project.`),
      { code: "RPC" },
    );
  }

  const availableVoices = profile.genderLock ? inventory.voices.filter(v => assetGender(v.displayName || v.voiceId, FLOW_VOICE_PROFILES, FLOW_PRESET_TRAITS) === profile.genderLock) : inventory.voices;
  const voice =
    resolveVoice(availableVoices, [profile.voiceName, profile.baseVoice]) ||
    (!profile.genderLock && resolveVoice(inventory.voices, character.presetVoiceId));
  if (!voice?.voiceId) throw Object.assign(new Error(`No matching voice ingredient is available in Flow. Generation was not started.`), {code:profile.genderLock?"GENDER_MISSING":"ATTACH"});
  onProgress?.(
    `Flow: [rpc] using ${character.displayName || profile.character}` +
      (voice?.voiceId ? ` + ${voice.displayName || voice.voiceId} voice` : " + saved character voice"),
  );

  const paths = [];
  const clipHashes = new Set();
  const lastId = clips[clips.length - 1].id;

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index];
    if (Date.now() > jobDeadline) {
      throw Object.assign(new Error(JOB_TIMEOUT_MESSAGE), { code: "TIMEOUT" });
    }
    if (index > 0) {
      onProgress?.(`Flow: [rpc] cooling down before ${clip.id} to protect the account`);
      await pause(page, 12_000, 20_000);
    }

    onProgress?.(
      clip.hold
        ? `Flow: [clip] ${clip.id}/${lastId} visual continuation`
        : clip.ctaBeat
          ? `Flow: [clip] ${clip.id}/${lastId} CTA close`
          : `Flow: [clip] ${clip.id}/${lastId} continuing discussion`,
    );
    const prompt = strictClipPrompt(clip);
    const dest = join(downloadDir, `${clip.id}.mp4`);
    const key = sha256(
      Buffer.from(
        [accountId, projectId, character.entityId, voice?.voiceId || "", clip.id, prompt].join("\0"),
      ),
    );
    let submitted = false;

    await client.generateClip({
      key,
      prompt,
      entityId: character.entityId,
      voiceId: voice?.voiceId || null,
      durationSec: clip.durationSec,
      destPath: dest,
      deadline: jobDeadline,
      reuse: true,
      onProgress(stage) {
        const detail = {
          snapshot: `Flow: [rpc] ${clip.id} checking project inventory`,
          captcha: `Flow: [rpc] ${clip.id} authorizing one generation`,
          submit: `Flow: [rpc] ${clip.id} sending one generate request`,
          polling: `Flow: [rpc] ${clip.id} generating`,
          download: `Flow: [rpc] ${clip.id} downloading`,
          done: `Flow: [rpc] ${clip.id} download complete`,
        }[stage];
        if (detail) onProgress?.(detail);
      },
      onSubmitted() {
        if (submitted) return;
        submitted = true;
        onDispatched?.();
        onProgress?.(`Flow: [rpc] ${clip.id} submitted once — retries will only resume polling`);
      },
    });

    const take = await isPlayableTake(dest);
    if (!take.ok) {
      throw Object.assign(
        new Error(`Flow: ${clip.id} download was ${take.reason} — not a finished take.`),
        { code: "DOWNLOAD", dispatched: submitted },
      );
    }
    const hash = sha256(await readFile(dest));
    if (clipHashes.has(hash)) {
      throw Object.assign(
        new Error(`Flow: ${clip.id} downloaded a duplicate of an earlier clip.`),
        { code: "DUPLICATE", dispatched: submitted },
      );
    }
    clipHashes.add(hash);
    onProgress?.(`Flow: [rpc] ${clip.id} checking speech against copy`);
    const heard = await assertSpeechMatches(dest, clip, speechKeys);
    onProgress?.(
      clip.hold
        ? `Flow: [ok] ${clip.id} silent as written`
        : `Flow: [ok] ${clip.id} said the copy: ${spokenLog(heard || clip.spoken)}`,
    );
    onProgress?.(`Flow: [ok] ${clip.id} saved (${(take.ms / 1000).toFixed(1)}s)`);
    paths.push(dest);
  }

  if (paths.length !== clips.length) {
    throw new Error(`Flow: ${clips.length - paths.length} clip(s) missing — will not stitch a partial reel.`);
  }
  const captions = await Promise.all(clips.map(async (clip, index) => ({
    text: clip.onScreen || "",
    spoken: clip.spoken, hold: clip.hold,
    role: captionRole(clip, index),
    words: clip.hold ? [] : await captionWordsFor(paths[index], speechKeys),
    transition: clip.scene?.transition || "dissolve",
  })));
  await writeFile(join(downloadDir, "edit-source.json"), JSON.stringify({paths,captions}));
  onProgress?.(`Flow: [ok] ${clips.length} clips ready — automatic editing follows`);
  return { videoPath: null, clipsReady: true, credits: session.credits, email: session.email, clips: clips.length };
}

export async function generateReel(accountId, storageState, input, { downloadDir, onProgress, onCheckpoint } = {}) {
  const jobDeadline = generationDeadline(input.generationStartedAt);
  const transport = Object.keys(input?.resume?.clips||{}).length ? "dom" : flowGenerationTransport();
  return withAccountPage(accountId, storageState, async (page, context) => {
    artifactDirs.set(page, join(downloadDir, "debug"));
    const profile = resolveFlowVoice({
      name: input.personaName,
      handle: input.personaHandle,
      voiceName: input.voiceName,
      characterGender: input.characterGender,
    });
    const allClips = normalizeClips(input.clips, {
      hook: input.hook,
      script: input.script,
      characterName: profile.character,
      voiceName: profile.voiceName,
      onScreenText: input.onScreenText || input.captions,
      cta: input.cta,
      videoBrief: input.videoBrief,
      sceneDirection: input.sceneDirection,
    });
    // Internal-only: set by generateReelConcurrent to make one account produce
    // only its lane's slice of the video while the rest run on other accounts.
    const laneClipIds = Array.isArray(input.__laneClipIds) ? input.__laneClipIds : null;
    // Shared pool: the lane pulls clips as it finishes them instead of owning a fixed slice.
    const pool = input.__clipPool || null;
    if (pool && transport === "rpc") {
      throw Object.assign(new Error("Shared clip pool needs the browser transport."), { code: "RPC" });
    }
    const clips = pool ? [] : laneClipIds ? allClips.filter((c) => laneClipIds.includes(c.id)) : allClips;
    const speechKeys = speechKeysFrom(input);
    if (!(pool ? allClips.length : clips.length)) throw new Error("Need a script to split into Flow clips.");

    onProgress?.(`Flow: setup ${profile.character}…`);
    onProgress?.("Flow: [ok] scripted recover only — no Gemini");
    await mkdir(downloadDir, { recursive: true, mode: 0o700 });
    const ready = await readReady(accountId);
    const setupProjectUrl = ready?.characters?.[profile.character]?.projectUrl;
    const requestedProjectUrl =
      input?.flowProjectUrl || input?.projectUrl || input?.resume?.projectUrl || "";
    const resumeProjectUrl = isFlowProjectUrl(requestedProjectUrl) ? requestedProjectUrl : "";
    if (transport === "rpc" && !setupProjectUrl) {
      throw Object.assign(
        new Error(`Flow RPC mode needs ${profile.character} character setup once before generating.`),
        { code: "RPC" },
      );
    }
    // UI jobs start in a clean Flow project. A persisted job project URL is
    // used only for durable resume of that same reel.
    const targetProject = transport === "rpc" ? setupProjectUrl : resumeProjectUrl || FLOW_URL;
    await page.goto(targetProject, { waitUntil: "domcontentloaded", timeout: 60_000 });
    try {
      await waitForComposer(page);
    } catch (err) {
      onProgress?.(`Flow: [recover] composer not ready (${err.message || err})`);
      const ready = await recoverScripted(page, {
        kind: "composer",
        isDone: () => composerReady(page),
        onProgress,
      });
      if (!ready) throw err;
    }
    onProgress?.(`Flow: project ${page.url()}`);
    if (isFlowProjectUrl(page.url())) {
      await onCheckpoint?.({ projectUrl: await projectUrlFromPage(page) });
    }
    await think(page);
    const session = await detectSession(page, context, { checkBlocked: transport !== "rpc" });

    try {
      if (transport === "rpc") {
        let dispatched = false;
        try {
          return await generateReelWithRpc({
            page,
            accountId,
            clips,
            profile,
            speechKeys,
            session,
            downloadDir,
            onProgress,
            onDispatched: () => {
              dispatched = true;
            },
            jobDeadline,
          });
        } catch (err) {
          if (dispatched && err && typeof err === "object") err.dispatched = true;
          throw err;
        }
      }

      const avatarPath = await materializeAvatar(input.avatarUrl, downloadDir);
      const newHome = await isNewFlowHome(page);
      if (!newHome && !/\/project\//.test(page.url())) {
        await clickAny(page, [/new project/i, /^create$/i, /^video$/i], 3000);
        await waitForComposer(page).catch(() => undefined);
      }
      await agentOff(page);
      await ensureFlowCharacter(page, accountId, profile, avatarPath, onProgress).catch((err) => {
        onProgress?.(`Flow: [warn] character setup ${err.message || err}`);
      });
      await ensureCustomVoice(page, accountId, profile, onProgress).catch((err) => {
        onProgress?.(`Flow: [warn] voice setup ${err.message || err}`);
      });

      const paths = [];
      const lastId = allClips[allClips.length - 1].id;
      const generated = new Set();
      const renderDeadlineFor = createRenderBudget();
      const clipHashes = new Set();
      const rejectedHashes = new Set();
      const openMeta = new Map();
      const resumedClips =
        input?.resume?.clips && typeof input.resume.clips === "object"
          ? input.resume.clips
          : {};
      for (const [clipId, checkpoint] of Object.entries(resumedClips)) {
        if (!checkpoint || typeof checkpoint !== "object") continue;
        openMeta.set(clipId, { ...checkpoint });
        for (const hash of checkpoint.rejectedHashes || []) rejectedHashes.add(hash);
        if (checkpoint.clipState?.costCommitted || checkpoint.clipState?.phase === "dispatching") {
          generated.add(clipId);
        }
      }
      let lockedIdentity = profile.genderLock ? Object.values(resumedClips).find(c => c?.casting?.gender === profile.genderLock)?.casting || null : null;

      async function checkpointClip(state, extra = {}) {
        if (!onCheckpoint) return;
        const liveProjectUrl = isFlowProjectUrl(page.url()) ? await projectUrlFromPage(page) : "";
        try {
          await onCheckpoint({
            ...extra,
            ...(liveProjectUrl ? { projectUrl: liveProjectUrl } : {}),
            clipId: state.id,
            clipState: { ...state },
          });
        } catch (error) {
          if (error && typeof error === "object") error.code = error.code || "CHECKPOINT";
          throw error;
        }
      }

      async function checkSpeech(dest, clip, catcher) {
        const hash = sha256(await readFile(dest));
        if (rejectedHashes.has(hash)) {
          throw Object.assign(new Error(`Flow: ${clip.id} already rejected this previous take`), {
            code: "SPEECH",
            wrongFile: true,
          });
        }
        try {
          return await assertSpeechMatches(dest, clip, {...speechKeys,onVerification:detail=>onProgress?.(`Flow: [speech] ${clip.id} ${detail}`)}, allClips);
        } catch (err) {
          if (err.code === "SPEECH") {
            err.confirmedCurrent = Boolean(catcher?.openedAssetId) && !err.wrongFile;
            rejectedHashes.add(hash);
            catcher?.ban?.(hash);
            if (err.wrongFile) {
              onProgress?.(
                `Flow: [recover] ${clip.id} grabbed a previous take (${spokenLog(err.heard || "")}) — not this line`,
              );
            }
          }
          throw err;
        }
      }

      async function downloadClip(
        clip,
        catcher,
        since,
        playsBefore = 0,
        titlesBefore = [],
        editHrefsBefore = [],
        mediaBefore = 0,
        state = null,
      ) {
        editHrefsBefore = [...new Set([...editHrefsBefore, ...[...openMeta.entries()]
          .filter(([id]) => id !== clip.id).flatMap(([, meta]) => [...(meta.editHrefsBefore || []), checkpointAssetUrl(meta, page.url())]).filter(Boolean)])];
        if (state) setClipPhase(state, "acquiring");
        // Persist the verified identity before network/download work can fail.
        if (catcher?.openedAssetId) {
          const meta = openMeta.get(clip.id) || {};
          meta.assetId = catcher.openedAssetId;
          meta.assetUrl = checkpointAssetUrl({ assetId: meta.assetId }, page.url());
          if (state) {
            state.assetId = meta.assetId;
            state.assetOpenedAt = catcher.openedAt;
          }
          openMeta.set(clip.id, meta);
          if (state) await checkpointClip(state, meta);
        }
        onProgress?.(`Flow: [script] ${clip.id} downloading`);
        const dest = join(downloadDir, `${clip.id}.mp4`);
        const saved = await download1080(
          page,
          dest,
          clip.spoken,
          onProgress,
          catcher,
          since,
          playsBefore,
          titlesBefore,
          editHrefsBefore,
          mediaBefore,
          minimumExpectedDurationMs(clip.durationSec),
        );
        if (!saved) {
          throw Object.assign(new Error("Flow: could not download the identified clip."), {
            code: "DOWNLOAD",
          });
        }
        if (catcher?.openedAssetId) {
          if (state) {
            state.assetId = catcher.openedAssetId;
            state.assetOpenedAt = catcher.openedAt;
          }
          const meta = openMeta.get(clip.id) || {};
          meta.assetId = catcher.openedAssetId;
          meta.assetUrl = checkpointAssetUrl({ assetId: meta.assetId }, page.url());
          meta.playsAfter = await playCircleCount(page);
          meta.titlesAfter = await listClipTitleButtons(page);
          meta.editHrefsAfter = [
            ...new Set([...(await findEditHrefs(page)), page.url()].filter((url) => /\/edit\//.test(url))),
          ];
          openMeta.set(clip.id, meta);
          if (state) await checkpointClip(state, meta);
        }
        const take = await isPlayableTake(saved, {
          minMs: minimumExpectedDurationMs(clip.durationSec),
        });
        if (!take.ok) {
          throw Object.assign(new Error(`Flow: ${clip.id} download was ${take.reason} — not a finished take.`), {
            code: "DOWNLOAD",
          });
        }
        if (state) setClipPhase(state, "validating");
        onProgress?.(`Flow: [script] ${clip.id} checking speech against copy`);
        let heard = null;
        try {
          heard = await checkSpeech(saved, clip, catcher);
        } catch (err) {
          if (err.code !== "SPEECH") throw err;
          // Identity is already known: re-opening UI controls cannot repair spoken words.
          if(err.confirmedCurrent)throw err;
          const alts = catcher?.ranked
            ? await catcher.ranked({
                since: since ?? catcher.startedAt,
                afterOpenOnly: true,
              })
            : [];
          let recovered = false;
          for (const hit of alts) {
            if (rejectedHashes.has(hit.hash)) continue;
            await writeFile(dest, hit.body);
            if (
              !(
                await isPlayableTake(dest, {
                  minMs: minimumExpectedDurationMs(clip.durationSec),
                })
              ).ok
            ) {
              continue;
            }
            try {
              heard = await checkSpeech(dest, clip, catcher);
              catcher?.markSaved?.(hit);
              onProgress?.(`Flow: [ok] ${clip.id} kept a different network take that matches the copy`);
              recovered = true;
              break;
            } catch {
              /* try next captured MP4 */
            }
          }
          if (!recovered) {
            const titles = await listClipTitleButtons(page);
            const ranked = newClipTitles(titlesBefore, titles)
              .map((title) => ({
                ...title,
                score: scoreAutoTitle(title.name, clip.spoken),
              }))
              .sort((a, b) => b.score - a.score || b.y - a.y || b.x - a.x);
            if (ranked.length) {
              onProgress?.(
                `Flow: [script] ${clip.id} trying tiles: ${ranked
                  .slice(0, 5)
                  .map((t) => t.name)
                  .join("; ")}`,
              );
            }
            for (const pick of ranked.slice(0, 6)) {
              await leaveClipEditor(page).catch(() => undefined);
              await dismissMenus(page);
              if (!(await clickNamedClipTitle(page, pick.name))) continue;
              if (!(await waitOpened(page, 4000))) continue;
              const openedAssetId = assetIdFromEditUrl(page.url());
              const oldIds = new Set(editHrefsBefore.map(assetIdFromEditUrl).filter(Boolean));
              if (
                !openedAssetId ||
                oldIds.has(openedAssetId) ||
                (state?.assetId && openedAssetId !== state.assetId)
              ) {
                continue;
              }
              catcher?.markOpened?.(page.url());
              const next = await harvestEditorVideo(
                page,
                dest,
                catcher,
                since,
                minimumExpectedDurationMs(clip.durationSec),
              );
              if (
                !next ||
                !(
                  await isPlayableTake(next, {
                    minMs: minimumExpectedDurationMs(clip.durationSec),
                  })
                ).ok
              ) {
                continue;
              }
              try {
                heard = await checkSpeech(next, clip, catcher);
                onProgress?.(`Flow: [ok] ${clip.id} from tile ${pick.name}`);
                recovered = true;
                break;
              } catch {
                onProgress?.(`Flow: [recover] ${clip.id} tile ${pick.name} was the wrong take`);
              }
            }
          }
          if (!recovered) throw err;
        }
        const verifiedTake = await isPlayableTake(dest, {
          minMs: minimumExpectedDurationMs(clip.durationSec),
        });
        const hash = sha256(await readFile(dest));
        if (clipHashes.has(hash)) {
          throw Object.assign(new Error(`Flow: ${clip.id} downloaded a duplicate of an earlier clip.`), {
            code: "DUPLICATE",
          });
        }
        clipHashes.add(hash);
        const meta = openMeta.get(clip.id) || {};
        meta.mediaHash = hash;
        meta.durationMs = verifiedTake.ms;
        if (catcher?.lastSaved) meta.networkMedia = catcher.lastSaved;
        openMeta.set(clip.id, meta);
        if (state) {
          state.mediaHash = hash;
          state.durationMs = verifiedTake.ms;
        }
        onProgress?.(
          clip.hold
            ? `Flow: [ok] ${clip.id} silent as written`
            : `Flow: [ok] ${clip.id} said the copy: ${spokenLog(heard || clip.spoken)}`,
        );
        onProgress?.(`Flow: [ok] ${clip.id} saved (${(verifiedTake.ms / 1000).toFixed(1)}s)`);
        if (state) setClipPhase(state, "verified");
        if (state) await checkpointClip(state, meta);
        await leaveClipEditor(page);
        return dest;
      }

      async function runClip(clip, state, { reuse } = {}) {
        if (reuse && generated.has(clip.id)) {
          setClipPhase(state, "acquiring");
          onProgress?.(`Flow: [recover] ${clip.id} already submitted — locating its output, not generating again`);
          const meta = openMeta.get(clip.id) || { titlesBefore: [], playsBefore: 0 };
          const catcher = createMediaCatcher(page, { banned: rejectedHashes });
          try {
            if (meta.assetUrl && assetIdFromEditUrl(meta.assetUrl) === meta.assetId) {
              await page.goto(meta.assetUrl, {
                waitUntil: "domcontentloaded",
                timeout: 30_000,
              }).catch(() => undefined);
              if (
                assetIdFromEditUrl(page.url()) === meta.assetId &&
                (await waitForPlayableMedia(page))
              ) {
                catcher.markOpened(meta.assetUrl);
              }
            }
            if (!catcher.openedAssetId) {
              if (/\/edit\//.test(page.url())) await leaveClipEditor(page);
              const priorUrls = [...new Set([...(meta.editHrefsBefore || []), ...[...openMeta.entries()]
                .filter(([id]) => id !== clip.id).flatMap(([, value]) => [...(value.editHrefsBefore || []), checkpointAssetUrl(value, page.url())]).filter(Boolean)])];
              onProgress?.(`Flow: [recover] ${clip.id} waiting for the submitted clip to become playable — no new generation`);
              await waitForOutput(page, onProgress, clip, meta.mediaBefore || 0, meta.pendingBefore || 0,
                meta.playsBefore || 0, jobDeadline, catcher, meta.titlesBefore || [], priorUrls, renderDeadlineFor(clip.id, state.dispatchCount));
            }
            const saved = await downloadClip(
              clip,
              catcher,
              meta.genAt || catcher.startedAt,
              meta.playsBefore,
              meta.titlesBefore,
              meta.editHrefsBefore,
              meta.mediaBefore,
              state,
            );
            await checkpointClip(state, meta);
            return saved;
          } finally {
            catcher.off();
          }
        }

        setClipPhase(state, "preflight");
        if (state.generationRetries > 0) {
          // Reload the same project to discard stale editor/composer state.
          const projectUrl = await projectUrlFromPage(page);
          await page.goto(projectUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await waitForComposer(page);
          await agentOff(page);
        }
        await leaveClipEditor(page).catch(() => undefined);
        try {
          await applyClipSettings(page, clip.durationSec);
        } catch (err) {
          onProgress?.(`Flow: [recover] ${clip.id} settings failed (${err.message || err})`);
          const recovered = await recoverScripted(page, {
            kind: "composer",
            isDone: () => composerReady(page),
            onProgress,
          });
          if (!recovered) throw err;
          await applyClipSettings(page, clip.durationSec);
        }
        if (!lockedIdentity) {
          lockedIdentity = await resolveLiveIdentity(page, profile, onProgress);
          if (!lockedIdentity.character && !avatarPath) {
            onProgress?.(`Flow: no character reference available — generating without character attachment`);
          }
          if (!lockedIdentity.voice) {
            throw Object.assign(
              new Error(`Flow: no matching ${profile.genderLock || ""} voice asset is available for ${profile.voiceName}.`),
              { code: profile.genderLock ? "GENDER_MISSING" : "ATTACH" },
            );
          }
        }
        const live = lockedIdentity;
        const livePrompt = strictClipPrompt(clip);
        const line = spokenLog(clip.spoken) || (clip.hold ? "silent hold" : "");
        onProgress?.(`Flow: [script] ${clip.id} writing prompt: ${line}`);
        let filled = false;
        try {
          filled = await fillPrompt(page, livePrompt);
          if (!filled) filled = await fillPrompt(page, livePrompt);
        } catch (err) {
          onProgress?.(`Flow: [recover] ${clip.id} prompt write crashed (${err.message || err})`);
        }
        if (!filled) {
          onProgress?.(`Flow: [recover] ${clip.id} prompt fill failed`);
          filled = await recoverScripted(page, {
            kind: "prompt",
            isDone: async () => fillPrompt(page, livePrompt).catch(() => false),
            onProgress,
          });
        }

        const voiceArgs = {
          ...profile,
          avatarPath,
          characterPick: live.character,
          voicePick: live.voice,
          character: live.character || profile.character,
          voiceName: live.voice || profile.voiceName,
        };
        const attached = await attachIngredients(page, voiceArgs, onProgress);
        if (!attached.characterOk && !attached.imageOk) {
          onProgress?.(`Flow: ${clip.id} no character ingredient attached — continuing without character`);
        }
        if (!attached.voiceOk) {
          throw Object.assign(
            new Error(`Flow: ${clip.id} voice ingredient did not attach; generation was not started.`),
            { code: "ATTACH" },
          );
        }
        if (attached.voiceAttached && attached.voiceAttached !== profile.voiceName) {
          onProgress?.(`Flow: [ok] ${clip.id} using ${attached.voiceAttached} (no ${profile.voiceName} in Flow)`);
        }

        if (!(await promptIsFilled(page, livePrompt))) {
          onProgress?.(`Flow: [recover] ${clip.id} prompt missing after attach — rewriting this line`);
          filled = await fillPrompt(page, livePrompt).catch(() => false);
        }
        if (!(await promptIsFilled(page, livePrompt))) {
          await dumpUi(page, "last-prompt-ui.txt").catch(() => undefined);
          await screenshot(page, "last-prompt.png").catch(() => undefined);
          throw Object.assign(new Error(`Flow: could not write ${clip.id} dialogue into the prompt.`), { code: "PROMPT" });
        }
        onProgress?.(`Flow: [ok] ${clip.id} prompt locked: ${dialogueFingerprint(livePrompt).slice(0, 72)}`);

        await page.keyboard.press("Escape").catch(() => undefined);
        await pause(page, 220, 700);
        onProgress?.(`Flow: [script] ${clip.id} starting generate`);
        const mediaBefore = await canvasMediaCount(page);
        const pendingBefore = await renderPending(page);
        const playsBefore = await playCircleCount(page);
        const titlesBefore = await listClipTitleButtons(page);
        const editHrefsBefore = [...new Set([...(await findEditHrefs(page)),
          ...[...openMeta.values()].flatMap(meta => [...(meta.editHrefsBefore || []), checkpointAssetUrl(meta, page.url())]).filter(Boolean)])];
        const genAt = Date.now();
        const identityBefore = {
          ...(profile.genderLock ? {casting:{character:live.character || "",voice:live.voice,gender:profile.genderLock}} : {}),
          assetId: null, assetUrl: null, mediaHash: null, networkMedia: null,
          rejectedHashes: [...rejectedHashes],
          titlesBefore,
          playsBefore,
          mediaBefore,
          pendingBefore,
          editHrefsBefore,
          genAt,
        };
        openMeta.set(clip.id, identityBefore);
        const catcher = createMediaCatcher(page, { banned: rejectedHashes });
        try {
          setClipPhase(state, "dispatching");
          await checkpointClip(state, identityBefore);
          const started = await startGenerate(page);
          if (!started) {
            const guardText = await bodyText(page);
            if (looksOutOfCredits(guardText)) throw Object.assign(new Error(OUT_OF_CREDITS), { code: "CREDITS" });
            if (looksFlowBlocked(guardText)) throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
            if (looksSignedOut(page.url(), guardText)) throw Object.assign(new Error(SESSION_EXPIRED), { code: "EXPIRED" });
            await dumpUi(page, "last-no-start-ui.txt").catch(() => undefined);
            await screenshot(page, "last-no-start.png").catch(() => undefined);
            throw Object.assign(new Error("Flow: generate control was not enabled; no request was sent."), {
              code: "NO_START",
            });
          }
          markClipDispatched(state, genAt);
          generated.add(clip.id);
          if (!isFlowProjectUrl(page.url())) {
            await page
              .waitForURL(/https:\/\/flow\.google\.com\/project\/[a-z0-9-]+/i, {
                timeout: 8_000,
              })
              .catch(() => undefined);
          }
          try {
            await checkpointClip(state, identityBefore);
          } catch (error) {
            if (error && typeof error === "object") error.dispatched = true;
            throw error;
          }

          try {
            await waitForOutput(
              page,
              onProgress,
              clip,
              mediaBefore,
              pendingBefore,
              playsBefore,
              jobDeadline,
              catcher,
              titlesBefore,
              editHrefsBefore,
              renderDeadlineFor(clip.id, state.dispatchCount),
            );
            setClipPhase(state, "rendered");
            await checkpointClip(state, identityBefore);
          } catch (err) {
            if (err.code === "CREDITS" || err.code === "EXPIRED" || err.code === "BLOCKED") throw err;
            if (err.code === "CHECKPOINT" || err.code === "MEDIA_LOAD_FAILED") throw err;
            onProgress?.(
              `Flow: [recover] ${clip.id} render observation ended (${err.message}) — finding the submitted take, not generating again`,
            );
          }
          const afterText = await bodyText(page);
          if (looksOutOfCredits(afterText)) {
            throw Object.assign(new Error(OUT_OF_CREDITS), { code: "CREDITS" });
          }
          if (looksFlowBlocked(afterText)) {
            throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
          }
          const saved = await downloadClip(
            clip,
            catcher,
            genAt,
            playsBefore,
            titlesBefore,
            editHrefsBefore,
            mediaBefore,
            state,
          );
          await checkpointClip(state, identityBefore);
          return saved;
        } finally {
          catcher.off();
        }
      }

      const laneClips = pool ? [] : clips;
      let handled = 0;
      let currentClipId = null;
      try {
      while (true) {
        let clip;
        if (pool) {
          const claimedId = pool.claim(accountId);
          if (claimedId === null) break;
          clip = allClips.find((c) => c.id === claimedId);
          if (!clip) {
            pool.fail(claimedId);
            continue;
          }
          laneClips.push(clip);
        } else {
          if (handled >= clips.length) break;
          clip = clips[handled];
        }
        currentClipId = clip.id;
        if (handled++ > 0) {
          onProgress?.(
            `Flow: [rate-limit] waiting ${INTER_GENERATION_MS}ms before ${clip.id}`,
          );
          await page.waitForTimeout(INTER_GENERATION_MS);
        }
        onProgress?.(
          clip.hold
            ? `Flow: [clip] ${clip.id}/${lastId} visual continuation`
            : clip.ctaBeat
              ? `Flow: [clip] ${clip.id}/${lastId} CTA close`
              : `Flow: [clip] ${clip.id}/${lastId} continuing discussion`,
        );
        const checkpoint = resumedClips[clip.id] || {};
        const state = restoreClipState(clip.id, checkpoint.clipState || {});
        if (state.costCommitted) generated.add(clip.id);
        const existingPath = join(downloadDir, `${clip.id}.mp4`);
        if (state.phase === "verified") {
          const exists = await stat(existingPath).then(() => true).catch(() => false);
          if (exists) {
            const take = await isPlayableTake(existingPath, {
              minMs: minimumExpectedDurationMs(clip.durationSec),
            });
            const hash = take.ok ? sha256(await readFile(existingPath)) : "";
            if (take.ok && (!state.mediaHash || state.mediaHash === hash)) {
              clipHashes.add(hash);
              paths.push(existingPath);
              pool?.done(clip.id);
              currentClipId = null;
              onProgress?.(`Flow: [ok] ${clip.id} restored from verified checkpoint`);
              continue;
            }
          }
          state.phase = "acquiring";
          state.costCommitted = true;
          generated.add(clip.id);
        }
        if(Array.isArray(input.recoveryTargetIds) && !input.recoveryTargetIds.includes(clip.id)) continue;
        let dest = null;
        let lastErr = null;
        onProgress?.(`Flow: [retry] ${clip.id} attempt ${Number(state.generationRetries||0)+1}/${MAX_CLIP_ATTEMPTS}`);
        while (!dest) {
          if (Date.now() > jobDeadline) {
            throw attachDispatchState(
              Object.assign(new Error(JOB_TIMEOUT_MESSAGE), { code: "TIMEOUT" }),
              state,
            );
          }
          try {
            dest = await runClip(clip, state, { reuse: state.costCommitted });
            lastErr = null;
          } catch (rawError) {
            const decision = recoveryForClip(state, rawError, CLIP_RETRY_LIMITS);
            lastErr = decision.error;
            const detail = lastErr.message || lastErr;
            if (decision.action === "retry-preflight") {
              onProgress?.(
                `Flow: [recover] ${clip.id} preflight retry ${state.preflightRetries}/2 (${detail}) — no credit spent`,
              );
              await pause(page, 350, 900);
              continue;
            }
            if (decision.action === "retry-acquire") {
              onProgress?.(
                `Flow: [recover] ${clip.id} download-only recovery ${state.acquisitionRetries}/3 (${detail}) — no new generation`,
              );
              await pause(page, 500, 1400);
              continue;
            }
            if (decision.action === "regenerate-content" || decision.action === "regenerate-unavailable") {
              generated.delete(clip.id);
              const failedPath = join(downloadDir, `${clip.id}.mp4`);
              try { rejectedHashes.add(sha256(await readFile(failedPath))); }
              catch (error) { if (error.code !== "ENOENT") throw error; }
              const previous = openMeta.get(clip.id) || {};
              const fresh = freshAttemptMetadata(previous, checkpointAssetUrl(previous, page.url()), [...rejectedHashes]);
              openMeta.set(clip.id, fresh);
              await checkpointClip(state, fresh);
              await rm(failedPath, { force: true });
              onProgress?.(`Flow: [retry] ${clip.id} clearing failed take — fresh composer, prompt and ingredient checks next`);
              const delay=retryDelayMs(state.generationRetries);
              onProgress?.(`Flow: [retry] ${clip.id} attempt ${state.generationRetries+1}/${MAX_CLIP_ATTEMPTS} in ${delay/1000}s — ${decision.action==='regenerate-content'?'speech did not match':'previous take could not be recovered'}. Completed clips are preserved.`);
              await checkpointClip(state,openMeta.get(clip.id)||{});
              // Short pauses keep the browser/job deadline observable during backoff.
              for(let waited=0;waited<delay;waited+=5000){
                if(Date.now()>jobDeadline)throw attachDispatchState(Object.assign(new Error(JOB_TIMEOUT_MESSAGE),{code:'TIMEOUT'}),state);
                await page.waitForTimeout(Math.min(5000,delay-waited));
              }
              continue;
            }
            if (decision.action === "resume-after-restart") {
              onProgress?.(
                `Flow: [recover] ${clip.id} browser closed after dispatch — checkpointed for download-only resume`,
              );
            }
            if(Number(state.generationRetries||0)>=MAX_CLIP_ATTEMPTS-1){
              lastErr.message=`Flow: ${clip.id} stopped after ${MAX_CLIP_ATTEMPTS} generation attempts. Saved clips are preserved. ${lastErr.message}`;
            }
            throw attachDispatchState(lastErr, state);
          }
        }
        if (!dest) {
          await dumpUi(page, "last-error-ui.txt").catch(() => undefined);
          await screenshot(page, "last-error.png").catch(() => undefined);
          throw attachDispatchState(
            Object.assign(
              new Error(`Flow: ${clip.id} did not produce a verified take. ${lastErr?.message || lastErr || "unknown error"}`),
              { code: lastErr?.code },
            ),
            state,
          );
        }
        paths.push(dest);
        pool?.done(clip.id);
        currentClipId = null;
      }
      } catch (laneError) {
        // A failed clip stays failed: it is never re-queued to another lane, so no second paid dispatch.
        if (pool && currentClipId) pool.fail(currentClipId);
        throw laneError;
      }
      if (paths.length !== laneClips.length && Array.isArray(input.recoveryTargetIds)) {
        onProgress?.(`Flow: [ok] Selected clips saved; ${laneClips.length-paths.length} other clips still need attention`);
        return {videoPath:null,clipsReady:false,partialClips:true,credits:session.credits,email:session.email,clips:paths.length};
      }
      if (paths.length !== laneClips.length) {
        throw new Error(`Flow: ${laneClips.length - paths.length} clip(s) missing — will not stitch a partial reel.`);
      }

      if (laneClipIds || pool) {
        // A lane's own captions/edit-source assembly happens once, in
        // generateReelConcurrent, after every lane finishes — using the full
        // clip list so caption roles and clip order stay correct.
        const credits = parseCreditsFromText(await bodyText(page)) ?? session.credits;
        return { laneDone: true, laneClipIds: laneClips.map((c) => c.id), credits, email: session.email };
      }

      const captions = await Promise.all(clips.map(async (c, i) => ({ text: c.onScreen || "", spoken: c.spoken, hold: c.hold, role: captionRole(c, i), words: c.hold ? [] : await captionWordsFor(paths[i], speechKeys), transition: c.scene?.transition || "dissolve" })));
      await writeFile(join(downloadDir, "edit-source.json"), JSON.stringify({paths,captions}));
      onProgress?.(`Flow: [ok] ${clips.length} clips ready — automatic editing follows`);
      const credits = parseCreditsFromText(await bodyText(page)) ?? session.credits;
      return { videoPath: null, clipsReady: true, credits, email: session.email, clips: clips.length };
    } catch (err) {
      if (!err.code) await screenshot(page);
      throw err;
    }
  }, { flush: transport !== "rpc" });
}

/**
 * Partitions one video's clips (or, when `input.recoveryTargetIds` is set,
 * just the clips being regenerated) into contiguous chunks and generates
 * each chunk on its own lane in parallel, so the work finishes in roughly
 * (longest lane's time) instead of (sum of every clip's time). Each lane
 * runs the exact same generateReel() clip loop — including its own fresh
 * Flow project, character/voice setup, checkpointing, and retries — on
 * just its slice of clips (input.__laneClipIds). Falls back to a single
 * lane (identical to calling generateReel directly) when only one lane, or
 * fewer clips than lanes, are available.
 */
export async function generateReelConcurrent(lanes, input, { downloadDir, onProgress, onCheckpoint, onLaneFinished, laneRunner = generateReel } = {}) {
  // Tells the caller as soon as one lane settles so its account can be freed for other videos.
  const watchLane = (lane, promise) =>
    !onLaneFinished
      ? promise
      : promise.then(
          async (value) => {
            await Promise.resolve(onLaneFinished(lane, null)).catch(() => undefined);
            return value;
          },
          async (error) => {
            await Promise.resolve(onLaneFinished(lane, error)).catch(() => undefined);
            throw error;
          },
        );
  const profile = resolveFlowVoice({
    name: input.personaName,
    handle: input.personaHandle,
    voiceName: input.voiceName,
    characterGender: input.characterGender,
  });
  const allClips = normalizeClips(input.clips, {
    hook: input.hook,
    script: input.script,
    characterName: profile.character,
    voiceName: profile.voiceName,
    onScreenText: input.onScreenText || input.captions,
    cta: input.cta,
    videoBrief: input.videoBrief,
    sceneDirection: input.sceneDirection,
  });
  if (!allClips.length) throw new Error("Need a script to split into Flow clips.");

  const targetIds = Array.isArray(input.recoveryTargetIds) ? input.recoveryTargetIds : null;
  const clipsToAssign = targetIds ? allClips.filter((c) => targetIds.includes(c.id)) : allClips;
  if (!clipsToAssign.length) throw new Error("No matching clips to regenerate.");

  const chunks = partitionClipsForLanes(clipsToAssign, lanes.length);
  const activeLanes = lanes.slice(0, chunks.length);
  if (activeLanes.length > 1) {
    onProgress?.(
      `Flow: [concurrent] splitting ${clipsToAssign.length} clip(s) across ${activeLanes.length} lanes (${chunks.map((c) => c.length).join(" + ")})`,
    );
  }

  // Shared pool is skipped (fixed slices, as before) for the RPC transport, a
  // single lane, the FLOW_CLIP_POOL=0 kill switch, or a resume that holds
  // in-flight clips we cannot map back to the lane whose project contains them.
  const resumeClips = input?.resume?.clips && typeof input.resume.clips === "object" ? input.resume.clips : {};
  let pool = null;
  let poolOwned = {};
  const orphanIds = new Set();
  if (process.env.FLOW_CLIP_POOL !== "0" && flowGenerationTransport() !== "rpc" && activeLanes.length > 1) {
    const targetSet = new Set(clipsToAssign.map((c) => c.id));
    const ownedAll = new Set();
    for (const lane of activeLanes) {
      poolOwned[lane.accountId] = (lane.ownedClipIds || []).filter((id) => resumeClips[id] && targetSet.has(id));
      for (const id of poolOwned[lane.accountId]) ownedAll.add(id);
    }
    const orphans = Object.entries(resumeClips).filter(([id]) => targetSet.has(id) && !ownedAll.has(id));
    if (orphans.every(([, cp]) => cp?.clipState?.phase === "verified")) {
      for (const [id] of orphans) orphanIds.add(id);
      pool = createClipPool([...targetSet], { owned: poolOwned });
      for (const lane of activeLanes) pool.reserve(lane.accountId);
      onProgress?.(
        `Flow: [concurrent] shared clip pool — ${activeLanes.length} lanes each take the next clip as soon as they finish one`,
      );
    }
  }

  let pooledOutcomes = null;
  if (pool) {
    pooledOutcomes = await Promise.allSettled(
      activeLanes.map((lane) => {
        const mine = new Set(poolOwned[lane.accountId]);
        const laneEntries = Object.fromEntries(
          Object.entries(resumeClips).filter(([id]) => mine.has(id) || orphanIds.has(id)),
        );
        return watchLane(lane, laneRunner(
          lane.accountId,
          lane.storageState,
          {
            ...input,
            __clipPool: pool,
            flowProjectUrl: lane.resumeProjectUrl,
            projectUrl: undefined,
            resume: Object.keys(resumeClips).length ? { ...input.resume, clips: laneEntries } : input.resume,
          },
          {
            downloadDir,
            onProgress: (detail) => onProgress?.(detail, lane.accountLabel),
            onCheckpoint: (checkpoint) => onCheckpoint?.({ ...checkpoint, accountId: lane.accountId }),
          },
        ).then((result) => ({ lane, laneIds: result?.laneClipIds || [], result })));
      }),
    );
  }

  const outcomes = pooledOutcomes || await Promise.allSettled(
    activeLanes.map((lane, laneIndex) => {
      const laneIds = chunks[laneIndex].map((c) => c.id);
      const laneResume = input?.resume?.clips && typeof input.resume.clips === "object"
        ? Object.fromEntries(Object.entries(input.resume.clips).filter(([id]) => laneIds.includes(id)))
        : undefined;
      return watchLane(lane, laneRunner(
        lane.accountId,
        lane.storageState,
        {
          ...input,
          __laneClipIds: laneIds,
          flowProjectUrl: lane.resumeProjectUrl,
          projectUrl: undefined,
          resume: laneResume ? { ...input.resume, clips: laneResume } : input.resume,
        },
        {
          downloadDir,
          onProgress: (detail) => onProgress?.(detail, lane.accountLabel),
          onCheckpoint: (checkpoint) => onCheckpoint?.({ ...checkpoint, accountId: lane.accountId }),
        },
      ).then((result) => ({ lane, laneIds, result })));
    }),
  );

  // With the pool, clips a lane finished before it failed still count as done.
  const doneIds = new Set(pool ? pool.doneIds() : []);
  const laneFailures = [];
  let anyCredits = null;
  let anyEmail = null;
  outcomes.forEach((outcome, laneIndex) => {
    if (outcome.status === "fulfilled") {
      for (const id of outcome.value.laneIds) doneIds.add(id);
      if (outcome.value.result?.credits != null) anyCredits = outcome.value.result.credits;
      if (outcome.value.result?.email) anyEmail = outcome.value.result.email;
    } else {
      laneFailures.push({ lane: activeLanes[laneIndex], error: outcome.reason });
    }
  });

  const missing = clipsToAssign.filter((c) => !doneIds.has(c.id));
  const laneErrors = laneFailures.map((f) => ({ accountId: f.lane.accountId, error: f.error }));
  if (missing.length) {
    const detail = laneFailures
      .map((f) => `${f.lane.accountLabel}: ${f.error instanceof Error ? f.error.message : f.error}`)
      .join(" | ");
    onProgress?.(
      `Flow: [concurrent] ${doneIds.size}/${clipsToAssign.length} clip(s) saved; ${missing.length} still need attention${detail ? ` (${detail})` : ""}`,
    );
    if (doneIds.size > 0 || targetIds) {
      return {
        videoPath: null,
        clipsReady: false,
        partialClips: true,
        credits: anyCredits,
        email: anyEmail,
        clips: doneIds.size,
        laneErrors,
      };
    }
    // Every lane failed outright on a fresh (non-recovery) job — surface the
    // first lane's real error so the caller's account-status handling
    // (credits/expired/blocked/cooldown) still fires for every lane, not
    // just the one whose error happens to be re-thrown.
    const primary = laneFailures[0]?.error || new Error("Flow: concurrent generation failed on every account.");
    if (primary && typeof primary === "object") primary.laneErrors = laneErrors;
    throw primary;
  }

  if (targetIds) {
    // Regenerating a subset of an existing video: the other clips are
    // untouched on disk. Report success for the targets; the caller already
    // knows this isn't a full-video (re)assembly.
    onProgress?.(`Flow: [ok] Selected clips saved — ${doneIds.size} regenerated`);
    return { videoPath: null, clipsReady: false, partialClips: true, credits: anyCredits, email: anyEmail, clips: doneIds.size };
  }

  const speechKeys = speechKeysFrom(input);
  const paths = allClips.map((c) => join(downloadDir, `${c.id}.mp4`));
  const captions = await Promise.all(
    allClips.map(async (c, i) => ({
      text: c.onScreen || "",
      spoken: c.spoken,
      hold: c.hold,
      role: captionRole(c, i),
      words: c.hold ? [] : await captionWordsFor(paths[i], speechKeys),
      transition: c.scene?.transition || "dissolve",
    })),
  );
  await writeFile(join(downloadDir, "edit-source.json"), JSON.stringify({ paths, captions }));
  onProgress?.(`Flow: [ok] ${allClips.length} clips ready — automatic editing follows`);
  return { videoPath: null, clipsReady: true, credits: anyCredits, email: anyEmail, clips: allClips.length };
}
