import {readFile,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {CHROME,DESKTOP,manualChromeArgs,startProcess,stopProcess,desktopFrame,desktopInput,closeManualChrome} from "./manual-desktop.mjs";
import { displayAccountEmail } from "./identity.mjs";
import { isFlowAppUrl, looksLoggedInToFlow } from "./signed-in.mjs";
import { DATA_DIR, profileDir, saveSession, unlockProfile, updateAccount } from "./store.mjs";

const DISPLAY = process.env.FLOW_VNC_DISPLAY || ":99";
const LOGIN_MS = 45 * 60 * 1000;
const FLOW_URL = "https://flow.google.com/";
const chromeArgs = () => ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
export const EARLY_CLOSE = "Sign-in window closed too early — try again";

let active = null;
const loginRequest=join(DATA_DIR,"manual-login-request.json");
export async function restoreManualLogin(){
 const request=await readFile(loginRequest,"utf8").then(JSON.parse).catch(()=>null);
 if(request?.accountId && request.expiresAt>Date.now())await startLogin(request.accountId);
 else await rm(loginRequest,{force:true});
}


function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function livePages(session) {
  const pages = session?.context?.pages?.() ?? [];
  return pages.filter((page) => page && !page.isClosed());
}

function frontPage(session) {
  const pages = livePages(session);
  const google = [...pages].reverse().find((page) => /accounts\.google|ServiceLogin|signin\/v2|CheckCookie/i.test(page.url()));
  return google || pages[pages.length - 1] || session?.page || null;
}

function publicLogin(session) {
  if (!session) return { active: false };
  const page = frontPage(session);
  const pageUrl = page && !page.isClosed() ? page.url() : "";
  return {
    active: session.status === "waiting" || session.status === "starting",
    accountId: session.accountId,
    status: session.status,
    email: displayAccountEmail(session.email),
    error: session.error,
    pageUrl,
    desk: session.status === "waiting" || session.status === "starting",
    expiresAt: session.expiresAt,
  };
}

export function getLogin(accountId) {
  if (!active) return { active: false };
  if (accountId && active.accountId !== accountId) return { active: false, otherAccountId: active.accountId };
  return publicLogin(active);
}

async function stopProcesses(session) {
  await stopProcess(session.chrome);
  session.chrome = null;
  if (session.context) await session.context.close().catch(() => undefined);
  session.context = null;
  session.page = null;
  for (const proc of session.procs || []) await stopProcess(proc);
  session.procs = [];
}

async function failLogin(session, message) {
  if (!session || session.status === "connected") return;
  session.status = "error";
  session.error = message;
  clearTimeout(session.timer);
  await rm(loginRequest,{force:true});
  await stopProcesses(session);
}

export async function stopLogin() {
  const session = active;
  active = null;
  if (!session) return { active: false };
  clearTimeout(session.timer);
  await rm(loginRequest,{force:true});
  if (session.confirming) await session.confirming.catch(()=>{});
  await stopProcesses(session);
  return { active: false };
}

async function persistConnected(session, { text } = {}) {
  if (session.status === "connected") return publicLogin(session);
  if (session.persisting) return session.persisting;
  session.persisting = (async () => {
    const { parseCreditsFromText, resolveAccountIdentity } = await import("./flow.mjs");
    const context = session.context;
    const page =
      livePages(session).find((p) => isFlowAppUrl(p.url())) || frontPage(session) || session.page || context?.pages()?.[0];
    if (!context || !page) throw new Error(EARLY_CLOSE);
    text = await page.locator("body").innerText().catch(() => "");
    if (!looksLoggedInToFlow(page.url(), text)) throw new Error("Finish signing in and open your Flow projects, then confirm again.");
    const state = await context.storageState();
    const email = displayAccountEmail(await resolveAccountIdentity(page, context, state));
    await saveSession(session.accountId, state);
    await updateAccount(session.accountId, {
      status: "connected",
      email,
      lastError: null,
      lastChecked: new Date().toISOString(),
      creditsRemaining: parseCreditsFromText(text || ""),
    });
    session.email = email;
    await stopProcesses(session);
    await rm(loginRequest,{force:true});
    session.status = "connected";
    session.error = null;
    clearTimeout(session.timer);
    const result = publicLogin(session);
    return result;
  })();
  try {
    return await session.persisting;
  } finally {
    session.persisting = null;
  }
}

export async function confirmLogin(accountId) {
  const session = active;
  if (!session || session.accountId !== accountId) throw new Error("Sign-in window is not open.");
  if (session.status === "connected") return publicLogin(session);
  if (session.status === "error") throw new Error(session.error || EARLY_CLOSE);
  if (session.confirming) return session.confirming;
  session.confirming = (async () => {
    try {
      // Only after the user finishes login do we close native Chrome and inspect its saved profile.
      await closeManualChrome(session.chrome,DISPLAY);
      session.chrome = null;
      const {chromium} = await import("playwright");
      session.context = await chromium.launchPersistentContext(profileDir(accountId), {
        executablePath: CHROME, headless: true, args: [...chromeArgs(), "--password-store=basic"],
      });
      session.page = await session.context.newPage();
      await session.page.goto(FLOW_URL, {waitUntil:"domcontentloaded",timeout:60000});
      await session.page.waitForFunction(() => /new project|your projects|all media|ingredients|sign in|email or phone/i.test(document.body.innerText),{},{timeout:20000}).catch(()=>{});
      if (active !== session) throw new Error("Sign-in was cancelled.");
      return await persistConnected(session);
    } catch (error) {
      if (session.context) await session.context.close().catch(()=>{});
      session.context = null; session.page = null;
      if (active === session && session.status === "waiting" && (!session.chrome || session.chrome.exitCode !== null)) await launchManualChrome(session);
      throw error;
    }
  })();
  try { return await session.confirming; } finally { session.confirming = null; }
}

export async function captureFrame() {
  const session=active;
  if (!session || session.status !== "waiting" || session.confirming) return null;
  if (!session.frame) session.frame=desktopFrame(DISPLAY).catch(()=>null).finally(()=>{session.frame=null;});
  return session.frame;
}

export async function sendInput(body) {
  const session=active;
  if (!session || session.status !== "waiting" || session.confirming) throw new Error("Sign-in is not ready for input.");
  const next=(session.input || Promise.resolve()).then(()=>{
    if(active!==session || session.confirming)throw new Error("Sign-in is not ready for input.");
    return desktopInput(DISPLAY,body);
  });
  session.input=next.catch(()=>{});
  return next;
}

async function launchManualChrome(session) {
  session.chrome=startProcess(CHROME,manualChromeArgs(profileDir(session.accountId),FLOW_URL),DISPLAY);
  await sleep(1200);
  if (!session.chrome.pid || session.chrome.exitCode!==null) throw new Error("Chrome desktop could not start. Reopen Sign in to Flow.");
}

async function launchBrowser(session) {
  await unlockProfile(session.accountId);
  session.procs.push(startProcess("Xvfb",[DISPLAY,"-screen","0",`${DESKTOP.width}x${DESKTOP.height}x24`,"-ac","-nolisten","tcp"],DISPLAY));
  await sleep(700);
  await launchManualChrome(session);
}

export async function startLogin(accountId) {
  if (
    active &&
    active.accountId === accountId &&
    (active.status === "waiting" || active.status === "starting") &&
    Date.now() < active.expiresAt
  ) {
    return publicLogin(active);
  }
  if (active) await stopLogin();

  const expiresAt = Date.now() + LOGIN_MS;
  const session = {
    accountId,
    status: "starting",
    email: null,
    error: null,
    expiresAt,
    procs: [],
    context: null,
    page: null,
    timer: setTimeout(() => {
      void failLogin(session, "Sign-in timed out. Try Sign in to Flow again.");
    }, LOGIN_MS),
  };
  active = session;

  try {
    await writeFile(loginRequest,JSON.stringify({accountId,expiresAt}),{mode:0o600});
    await launchBrowser(session);
    session.status = "waiting";
    void watchForFlow(session);
    return publicLogin(session);
  } catch (err) {
    await failLogin(session, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function watchForFlow(session) {
  const started = Date.now();
  try {
    while (active === session && session.status === "waiting" && Date.now() - started < LOGIN_MS) {
      if (!session.confirming && (!session.chrome || (session.chrome.exitCode !== null && session.chrome.exitCode !== 0) || session.chrome.signalCode)) {
        await failLogin(session, EARLY_CLOSE);
        return;
      }
      await sleep(2500);
    }
    if (active === session && session.status === "waiting") {
      await failLogin(session, "Sign-in timed out. Try Sign in to Flow again.");
    }
  } catch (err) {
    if (active === session && session.status === "waiting") {
      const message = err instanceof Error ? err.message : String(err);
      await failLogin(session, /closed|target page|context/i.test(message) ? EARLY_CLOSE : message);
    }
  }
}
