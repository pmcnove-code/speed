const GEMINI_DEV_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = process.env.FLOW_BRAIN_MODEL || "gemini-2.5-flash";
const MAX_STEPS = 8;

export const RULES = {
  attach: `Prefer click_text with exact labels (Characters, Add to prompt, the character name).
If the overlay is on Voices (Achernar, Algenib…), click Characters — not a voice.
If the named character is selected and Add to prompt is visible, click Add to prompt.
Do not click Start generation. Do not create a new project. Do not delete anything.`,
  download: `You are in Google Flow after a clip finished, or on the All media grid.
Open the newest finished talking-head clip (click the tile, not empty canvas).
If the clip is Binned, click Restore.
Then Download media — 1080p if offered, else 720p or any mp4.
Do not start a new generation. Do not delete.`,
  recover: `A scripted step just failed. Look at the screenshot and recover toward the GOAL.
Close blocking overlays with Escape if they are not useful. Use Search assets / Characters / Download / Restore / All media if they help.
Do not sign out. Do not delete. Do not open Settings unless required for 9:16 or x1.`,
  stitch: `You are editing a Google Flow project that already has several finished talking-head clips.
Your job is to make ONE continuous 9:16 reel inside Flow, then download it.
Decide from the screen:
- Scenes / timeline / Combine / Stitch / Create video / Add to scene / Extend — use those if present.
- Select clips in spoken order (first generated clip first, newest last unless the grid is newest-first).
- If a scene timeline exists, drop or add clips in order and export that scene.
- If you are inside a single-clip editor, go back to the project (Done / All media / back) unless this editor already shows the full stitched reel.
- When one combined video is ready, click Download media (1080p or 720p).
- Do not delete clips. Do not recast the person. Do not start unrelated new generations from the composer unless that is clearly "combine / create from selected clips".`,
};

const visionAuth = { ok: true, reason: "" };

export function sanitizeGeminiKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

export function geminiKey() {
  return sanitizeGeminiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "");
}

export function visionAvailable() {
  return Boolean(geminiKey()) && visionAuth.ok;
}

export function visionOfflineReason() {
  if (!geminiKey()) return "no Gemini key on this job";
  return visionAuth.reason || "vision offline";
}

export function configureBrain({ key, project, model } = {}) {
  const cleaned = sanitizeGeminiKey(key);
  if (cleaned) process.env.GEMINI_API_KEY = cleaned;
  if (project) process.env.GEMINI_CLOUD_PROJECT = String(project).trim();
  if (model) process.env.FLOW_BRAIN_MODEL = String(model).trim();
  visionAuth.ok = true;
  visionAuth.reason = "";
  if (cleaned && /^\s*AQ\./i.test(cleaned)) {
    visionAuth.ok = false;
    visionAuth.reason = "Vertex express key (AQ.) cannot call Gemini vision — paste an AI Studio AIza… key";
  }
}

function markVisionDead(reason) {
  visionAuth.ok = false;
  visionAuth.reason = String(reason || "vision http error").slice(0, 160);
}

export function parseBrainReply(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const chunk = (fenced ? fenced[1] : text).trim();
  const start = chunk.indexOf("{");
  const end = chunk.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(chunk.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object") return null;
    return {
      done: Boolean(parsed.done),
      fail: Boolean(parsed.fail),
      thought: String(parsed.thought || "").slice(0, 280),
      action: String(parsed.action || "").toLowerCase(),
      x: Number(parsed.x),
      y: Number(parsed.y),
      x2: Number(parsed.x2),
      y2: Number(parsed.y2),
      text: String(parsed.text || parsed.name || "").trim(),
      key: String(parsed.key || "").trim(),
      amount: Number(parsed.amount),
    };
  } catch {
    return null;
  }
}

export function scaleClick(x, y, viewport) {
  const w = viewport?.width || 1440;
  const h = viewport?.height || 960;
  let px = Number(x);
  let py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  if (px >= 0 && px <= 1 && py >= 0 && py <= 1) {
    px *= w;
    py *= h;
  } else if (px > w + 8 || py > h + 8) {
    const srcW = px > 2000 ? 1000 : Math.max(px, w);
    const srcH = py > 1400 ? 1000 : Math.max(py, h);
    px = (px / srcW) * w;
    py = (py / srcH) * h;
  }
  px = Math.max(4, Math.min(w - 4, px));
  py = Math.max(4, Math.min(h - 4, py));
  return { x: Math.round(px), y: Math.round(py) };
}

async function snapshotUi(page) {
  return page.evaluate(() => {
    const labels = [
      ...new Set(
        [...document.querySelectorAll("button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [aria-label]")]
          .map((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return "";
            const t = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
            if (!t || t.length > 80) return "";
            return `${t} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
          })
          .filter(Boolean),
      ),
    ].slice(0, 90);
    return {
      url: location.href,
      labels,
      text: (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 2200),
    };
  });
}

async function askGemini(goal, shot, snap, viewport, { rules = "", history = [] } = {}) {
  const key = geminiKey();
  if (!key || !visionAuth.ok) return null;
  const model = (process.env.FLOW_BRAIN_MODEL || DEFAULT_MODEL).replace(/^models\//, "");
  const project = (process.env.GEMINI_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const hist = history.length
    ? `\nRecent decisions:\n${history.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n`
    : "";
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a decision-making operator for Google Flow (flow.google.com) in Playwright.
You see a screenshot plus control labels. Choose the next useful edit — do not blindly repeat a failed click.
Viewport is ${viewport.width}x${viewport.height} CSS pixels. Origin is the top-left of the visible viewport.

GOAL:
${goal}

${rules}

URL: ${snap.url}
${hist}
Visible controls (name @x,y wxh):
${(snap.labels || []).join("\n")}

Visible text:
${snap.text}

Reply with ONE JSON object only:
{"done":false,"fail":false,"thought":"why this next edit","action":"click|click_text|dblclick|drag|press|type|scroll|wait|fail","x":123,"y":456,"x2":200,"y2":300,"text":"Download media","key":"Escape","amount":400}

Rules:
- Prefer click_text with an exact visible label when it exists.
- Use click / dblclick x,y for tiles, timeline clips, and images.
- Use drag from x,y to x2,y2 to drop a clip onto a scene/timeline.
- scroll amount is wheel deltaY (positive = down).
- done=true only when the goal is already finished.
- fail=true only if the goal is impossible on this screen.
- Never delete media. Never click account/sign-out.`,
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: shot,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.15, maxOutputTokens: 500 },
  };
  const headers = { "x-goog-api-key": key, "Content-Type": "application/json" };
  if (project) headers["x-goog-user-project"] = project;
  const res = await fetch(`${GEMINI_DEV_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(28_000),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      markVisionDead(`vision http ${res.status}`);
    }
    return {
      done: false,
      fail: false,
      thought: `vision http ${res.status}${errBody ? ` ${errBody.replace(/\s+/g, " ").slice(0, 80)}` : ""}`,
      action: "",
      x: NaN,
      y: NaN,
      x2: NaN,
      y2: NaN,
      text: "",
      key: "",
      amount: NaN,
    };
  }
  const json = await res.json().catch(() => null);
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return parseBrainReply(text);
}

async function applyAction(page, step, viewport) {
  if (!step) return false;
  if (step.action === "wait") {
    await page.waitForTimeout(900);
    return true;
  }
  if (step.action === "scroll") {
    const delta = Number.isFinite(step.amount) ? step.amount : 400;
    await page.mouse.wheel(0, delta);
    return true;
  }
  if (step.action === "press" && step.key) {
    await page.keyboard.press(step.key).catch(() => undefined);
    return true;
  }
  if (step.action === "type" && step.text) {
    await page.keyboard.insertText(step.text).catch(() => undefined);
    return true;
  }
  if (step.action === "click_text" && step.text) {
    const loc = page.getByText(step.text, { exact: true }).last();
    if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
      await loc.click({ timeout: 3000 }).catch(() => undefined);
      return true;
    }
    const fuzzy = page.getByText(new RegExp(`^${step.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")).last();
    if (await fuzzy.isVisible({ timeout: 500 }).catch(() => false)) {
      await fuzzy.click({ timeout: 3000 }).catch(() => undefined);
      return true;
    }
  }
  if (step.action === "drag") {
    const a = scaleClick(step.x, step.y, viewport);
    const b = scaleClick(step.x2, step.y2, viewport);
    if (!a || !b) return false;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
    return true;
  }
  if (step.action === "dblclick") {
    const pt = scaleClick(step.x, step.y, viewport);
    if (!pt) return false;
    await page.mouse.dblclick(pt.x, pt.y);
    return true;
  }
  if (step.action === "click" || step.action === "click_text") {
    const pt = scaleClick(step.x, step.y, viewport);
    if (!pt) return false;
    await page.mouse.click(pt.x, pt.y);
    return true;
  }
  return false;
}

export function watchDownloads(page, destPath) {
  let saved = null;
  const onDownload = async (download) => {
    try {
      await download.saveAs(destPath);
      saved = destPath;
    } catch {
      saved = null;
    }
  };
  page.on("download", onDownload);
  return {
    got: () => saved,
    off() {
      page.off("download", onDownload);
    },
  };
}

export async function seeAndAct(_page, { isDone, onProgress } = {}) {
  onProgress?.("Flow: [recover] scripted only — Gemini vision is off");
  return Boolean(await isDone?.());
}
