import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

// ─── Constants ────────────────────────────────────────────────────────────────

export const FLOW_BLOCKED =
  "Flow paused this Google account for unusual activity. Wait before generating again — retrying makes the block last longer.";

const BOOTSTRAP_URL = "https://flow.google.com/project/";
const RPC_URL_BASE = "https://flow.google.com/_/AiSandboxAngularFrontend/data/batchexecute";
const MIN_VIDEO_BYTES = 100_000;

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
}

function isValidSignedVideoUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.pathname.includes("/video/");
  } catch {
    return false;
  }
}

function _uuidUpper() {
  return randomUUID().toUpperCase();
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Extract at/fSid/bl from WIZ_global_data. */
export function flowRpcMode(wizGlobalData) {
  const w = wizGlobalData || {};
  return {
    at: w.SNlM0e ?? null,
    fSid: w.FdrFJe ?? null,
    bl: w.cfb2h ?? null,
  };
}

export function flowGenerationTransport(value = process.env.FLOW_GENERATION_TRANSPORT) {
  return /^(rpc|api|direct)$/i.test(String(value || "").trim()) ? "rpc" : "ui";
}

function _extractWrbFrRows(data, rows) {
  if (!Array.isArray(data)) return;
  if (data[0] === "wrb.fr") {
    rows.push(data);
    return;
  }
  for (const item of data) {
    if (Array.isArray(item)) _extractWrbFrRows(item, rows);
  }
}

/**
 * Strip the anti-XSSI prefix and extract all wrb.fr rows from a
 * batchexecute response.  The response is a sequence of length-prefixed
 * JSON chunks: <decimal length>\n<JSON of that many chars>.
 */
export function parseBatchExecuteResponse(text) {
  const s = String(text || "");
  const body = s.replace(/^\)\]\}'/, "");
  const rows = [];

  // Google writes each JSON chunk on one line, while the preceding length is
  // measured in UTF-8 bytes. Parse those lines first so non-ASCII project
  // titles do not make JavaScript's UTF-16 string slicing miss the boundary.
  for (const line of body.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate.startsWith("[")) continue;
    try {
      _extractWrbFrRows(JSON.parse(candidate), rows);
    } catch {
      /* fall through to framed parsing below */
    }
  }
  if (rows.length) return rows;

  let i = 0;

  while (i < body.length) {
    // skip blank lines
    while (i < body.length && (body[i] === "\n" || body[i] === "\r")) i++;
    if (i >= body.length) break;

    // read candidate line
    let lineEnd = body.indexOf("\n", i);
    if (lineEnd === -1) lineEnd = body.length;
    const candidate = body.slice(i, lineEnd).trim();

    if (/^\d+$/.test(candidate) && candidate.length > 0) {
      const chunkLen = parseInt(candidate, 10);
      // skip \r?\n after the length line
      let chunkStart = lineEnd + 1;
      if (chunkStart < body.length && body[chunkStart - 1] === "\r") chunkStart++;
      const chunk = body.slice(chunkStart, chunkStart + chunkLen);
      try {
        const parsed = JSON.parse(chunk);
        _extractWrbFrRows(parsed, rows);
      } catch {
        /* malformed chunk */
      }
      i = chunkStart + chunkLen;
    } else {
      if (candidate.startsWith("[")) {
        try {
          const parsed = JSON.parse(candidate);
          _extractWrbFrRows(parsed, rows);
        } catch {
          /* skip */
        }
      }
      i = lineEnd + 1;
    }
  }

  return rows;
}

function _isUnusualActivityError(errField) {
  if (!errField) return false;
  return /PUBLIC_ERROR_UNUSUAL_ACTIVITY/i.test(JSON.stringify(errField));
}

/** Recursively find a signed https video URL in a parsed payload. */
function _findVideoUrl(data) {
  if (typeof data === "string" && /^https:\/\/.+\/video\//i.test(data)) return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = _findVideoUrl(item);
      if (found) return found;
    }
  }
  return null;
}

/** Recursively detect unusual-activity error text in a parsed payload. */
function _findUnusualActivity(data) {
  if (typeof data === "string" && /unusual.activity|PUBLIC_ERROR_UNUSUAL_ACTIVITY/i.test(data)) return true;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (_findUnusualActivity(item)) return true;
    }
  }
  return false;
}

/**
 * Parse the Zzl0ze project inventory payload.
 * Returns { media: [...], characters: [...], voices: [...] }.
 */
export function parseProjectInventory(payload) {
  if (!Array.isArray(payload)) return { media: [], characters: [], voices: [] };

  const media = [];
  const mediaRows = Array.isArray(payload[1]) ? payload[1] : [];
  for (const row of mediaRows) {
    if (!Array.isArray(row)) continue;
    const meta = Array.isArray(row[3]) ? row[3] : [];
    media.push({
      mediaId: row[0] ?? null,
      title: meta[0] ?? null,
      createdSec: Array.isArray(meta[1]) ? (meta[1][0] ?? null) : null,
      workflowId: meta[4] ?? null,
      operationId: meta[5] ?? null,
      projectId: row[4] ?? null,
      entityId: row[5] ?? null,
    });
  }

  const characters = [];
  const charRows = Array.isArray(payload[5]) ? payload[5] : [];
  for (const row of charRows) {
    if (!Array.isArray(row)) continue;
    const meta = Array.isArray(row[3]) ? row[3] : [];
    const voiceEntry = Array.isArray(meta[3]) && Array.isArray(meta[3][0]) ? meta[3][0] : null;
    characters.push({
      projectId: row[0] ?? null,
      entityId: row[1] ?? null,
      displayName: meta[1] ?? null,
      presetVoiceId: voiceEntry ? (voiceEntry[1] ?? null) : null,
      personalityNotes: meta[4] ?? null,
      thumbnailMediaId: row[4] ?? null,
    });
  }

  const voices = [];
  const voiceRows = [payload[3], payload[2]]
    .filter(Array.isArray)
    .flat()
    .filter((row) => Array.isArray(row) && row[1] === 3);
  for (const row of voiceRows) {
    if (!Array.isArray(row) || !row[0]) continue;
    voices.push({
      voiceId: String(row[0]),
      kind: row[1] ?? null,
      displayName: row[2] ?? null,
    });
  }

  return { media, characters, voices };
}

/**
 * Parse the as29s workflow detail payload.
 * Returns a detail object, { error: "BLOCKED" } on unusual activity, or null.
 */
export function parseWorkflowDetail(payload) {
  if (!Array.isArray(payload)) return null;
  if (_findUnusualActivity(payload)) return { error: "BLOCKED" };

  let videoUrl = null;
  try {
    const candidate = payload[6]?.[0]?.[8];
    if (typeof candidate === "string" && isValidSignedVideoUrl(candidate)) {
      videoUrl = candidate;
    }
  } catch {
    /* navigate safely */
  }
  if (!videoUrl) videoUrl = _findVideoUrl(payload);

  return {
    mediaId: payload[0] ?? null,
    projectId: payload[1] ?? null,
    workflowId: payload[2] ?? null,
    videoUrl: videoUrl || null,
    model: payload[6]?.[0]?.[12] ?? null,
    duration: payload[6]?.[1]?.[2]?.[0] ?? null,
  };
}

/**
 * Conservative character resolution.
 * Exact entityId first, exact case-insensitive displayName second,
 * sole-character fallback only when allowSole=true.
 */
export function resolveCharacter(characters, query, { allowSole = false } = {}) {
  if (!Array.isArray(characters) || characters.length === 0) return null;
  if (!query) {
    if (allowSole && characters.length === 1) return characters[0];
    return null;
  }
  const q = String(query).trim();
  const byId = characters.find((c) => c.entityId === q);
  if (byId) return byId;
  const qLower = q.toLowerCase();
  const byName = characters.find((c) => String(c.displayName || "").toLowerCase() === qLower);
  if (byName) return byName;
  if (allowSole && characters.length === 1) return characters[0];
  return null;
}

/** Resolve a voice by exact ID or display name, in caller-provided priority order. */
export function resolveVoice(voices, queries) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const wanted = (Array.isArray(queries) ? queries : [queries])
    .map((query) => String(query || "").trim().toLowerCase())
    .filter(Boolean);
  for (const query of wanted) {
    const match = voices.find(
      (voice) =>
        String(voice.voiceId || "").toLowerCase() === query ||
        String(voice.displayName || "").trim().toLowerCase() === query,
    );
    if (match) return match;
  }
  return null;
}

/**
 * Replace "with the custom voice named <name>" with saved-character-voice
 * wording, leaving all other prompt text intact.
 */
export function directPromptForCharacter(prompt, character) {
  const s = String(prompt || "");
  if (!character) return s;
  return s.replace(/with the custom voice named [^.,;]+/gi, "with its saved character voice");
}

/**
 * Build the MZZa6b video generate RPC input.
 * EXACT one-output R2V wire shape — final batch constant is always 2.
 */
export function buildVideoGenerateInput({
  prompt,
  durationSec,
  entityId,
  voiceId = null,
  projectId,
  captchaToken,
}) {
  const duration = Number(durationSec) || 8;
  const request = [
    [null, null, [[[prompt]]]],
    null,
    `abra_r2v_${duration}s`,
    1,
    null,
    [null, null, null, null, _uuidUpper(), _uuidUpper()],
    null,
    voiceId ? [[voiceId]] : null,
    null,
    [[entityId]],
  ];
  return [
    [request],
    [null, 22, null, null, null, projectId, null, null, null, null, [captchaToken, 1]],
    [_uuidUpper(), 2],
  ];
}

// ─── RPC client internals ─────────────────────────────────────────────────────

async function _mintCaptcha(page) {
  return page.evaluate(async () => {
    const script = document.querySelector('script[src*="recaptcha/enterprise"]');
    const m = script?.src?.match(/[?&]render=([^&]+)/);
    const siteKey = m ? m[1] : null;
    if (!siteKey || !window.grecaptcha?.enterprise?.execute) {
      throw new Error("reCAPTCHA enterprise not available");
    }
    return window.grecaptcha.enterprise.execute(siteKey, { action: "VIDEO_GENERATION" });
  });
}

async function _getWizMode(page) {
  const wiz = await page.evaluate(() => window.WIZ_global_data || {});
  return flowRpcMode(wiz);
}

async function _doRpc(page, { projectId, mode, rpcId, input }) {
  const { at, fSid, bl } = mode;
  if (!at || !fSid || !bl) {
    throw Object.assign(new Error("Flow session bootstrap tokens are missing — reconnect."), {
      code: "EXPIRED",
    });
  }
  const lang = await page.evaluate(() => document.documentElement.lang || "en");
  const reqid = 10000 + (Date.now() % 89999);

  const params = new URLSearchParams({
    rpcids: rpcId,
    "source-path": `/project/${projectId}`,
    bl: bl || "",
    "f.sid": fSid || "",
    hl: lang,
    _reqid: String(reqid),
    rt: "c",
  });

  const url = `${RPC_URL_BASE}?${params}`;
  const freq = JSON.stringify([[[rpcId, JSON.stringify(input), null, "generic"]]]);
  // Build form body without spreading sensitive values into logs
  const formBody = `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(at || "")}`;

  let responseText;
  try {
    responseText = await page.evaluate(
      async ([fetchUrl, body]) => {
        const res = await fetch(fetchUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "x-same-domain": "1",
          },
          body,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      },
      [url, formBody],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = /HTTP (401|403)\b/.test(message) ? "EXPIRED" : "RPC";
    throw Object.assign(new Error(`Flow RPC ${rpcId} request failed: ${message}`), { code });
  }

  const rows = parseBatchExecuteResponse(responseText);
  const row = rows.find((r) => r[1] === rpcId);
  if (!row) {
    throw Object.assign(new Error(`No RPC response row for ${rpcId}`), { code: "RPC" });
  }
  if (_isUnusualActivityError(row[5])) {
    throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
  }
  // Error code 3 with null payload = generic protocol / invalid-argument
  if (row[5] != null && row[2] == null) {
    throw Object.assign(new Error(`RPC ${rpcId} error (code ${Array.isArray(row[5]) ? row[5][0] : "?"})`), {
      code: "RPC",
    });
  }
  if (row[2] == null) return null;
  try {
    return JSON.parse(row[2]);
  } catch {
    throw Object.assign(new Error(`Flow RPC ${rpcId} returned malformed JSON.`), { code: "RPC" });
  }
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _jitter(base, _spread = 0) {
  return base;
}

// ─── Public client ────────────────────────────────────────────────────────────

/**
 * Create a browser-session-backed Flow RPC client.
 *
 * The caller must ensure `page` is already on
 * https://flow.google.com/project/<projectId> before calling methods, or
 * the client will navigate there automatically.
 *
 * Returns { inventory(), character(query, opts), generateClip({...}) }.
 */
export function createFlowRpcClient(page, { projectId, onProgress } = {}) {
  if (!isValidUUID(projectId)) throw new TypeError("A valid Flow projectId is required");

  // Per-clip cache: key -> { snapshotWorkflowIds, newWorkflowId }
  const _submitted = new Map();

  async function _ensureBootstrap() {
    const url = page.url();
    const currentProject = url.match(/flow\.google\.com\/project\/([0-9a-f-]+)/i)?.[1] || null;
    if (currentProject?.toLowerCase() !== projectId.toLowerCase()) {
      await page.goto(`${BOOTSTRAP_URL}${projectId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
  }

  async function inventory() {
    await _ensureBootstrap();
    const mode = await _getWizMode(page);
    const payload = await _doRpc(page, {
      projectId,
      mode,
      rpcId: "Zzl0ze",
      input: [`projects/${projectId}`, null, null, null, [1]],
    });
    return parseProjectInventory(payload);
  }

  async function character(query, opts = {}) {
    const inv = await inventory();
    return resolveCharacter(inv.characters, query, opts);
  }

  async function generateClip({
    key,
    prompt,
    entityId,
    voiceId = null,
    durationSec = 8,
    destPath,
    deadline,
    reuse = false,
    onSubmitted,
  }) {
    if (!key) throw new TypeError("key is required");
    if (!prompt) throw new TypeError("prompt is required");
    if (!isValidUUID(entityId)) throw new TypeError("A valid Flow entityId is required");
    if (!destPath) throw new TypeError("destPath is required");

    await _ensureBootstrap();

    let cached = reuse ? _submitted.get(key) : null;

    if (!cached) {
      // Snapshot before submitting so we can detect the new workflow
      onProgress?.("snapshot");
      const snap = await inventory();
      const snapshotWorkflowIds = new Set(snap.media.map((m) => m.workflowId).filter(Boolean));

      // Mint captcha (single-use token — never log it)
      onProgress?.("captcha");
      let captchaToken;
      try {
        captchaToken = await _mintCaptcha(page);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw Object.assign(new Error(`Could not mint Flow reCAPTCHA: ${message}`), { code: "RPC" });
      }

      onProgress?.("submit");
      const mode = await _getWizMode(page);
      const input = buildVideoGenerateInput({
        prompt,
        durationSec,
        entityId,
        voiceId,
        projectId,
        captchaToken,
      });

      // Cache before dispatch. If the response is lost, reuse=true resumes
      // inventory polling instead of spending credits on a second submission.
      cached = { snapshotWorkflowIds, newWorkflowId: null, dispatchedAt: Date.now() };
      _submitted.set(key, cached);
      onSubmitted?.({ key, workflowId: null });

      let submitPayload;
      try {
        submitPayload = await _doRpc(page, { projectId, mode, rpcId: "MZZa6b", input });
      } catch (err) {
        err.dispatched = true;
        throw err;
      }
      const candidateWorkflowId = submitPayload?.[0]?.[0]?.[0] ?? null;
      const newWorkflowId = isValidUUID(candidateWorkflowId) ? candidateWorkflowId : null;
      cached = { ...cached, newWorkflowId };
      _submitted.set(key, cached);
      onSubmitted?.({ key, workflowId: newWorkflowId });
    }

    const { snapshotWorkflowIds } = cached;
    const pollDeadline = deadline ? new Date(deadline).getTime() : Date.now() + 15 * 60 * 1000;

    // Initial delay before first inventory poll
    onProgress?.("polling");
    await _sleep(_jitter(20_000, 5_000));

    let foundWorkflowId = cached.newWorkflowId || null;

    if (!foundWorkflowId) {
      while (Date.now() < pollDeadline) {
        const inv = await inventory();
        const fresh = inv.media
          .filter((m) => isValidUUID(m.workflowId) && !snapshotWorkflowIds.has(m.workflowId))
          .sort((a, b) => Number(b.createdSec || 0) - Number(a.createdSec || 0))[0];
        if (fresh) {
          foundWorkflowId = fresh.workflowId;
          _submitted.set(key, { ...cached, newWorkflowId: foundWorkflowId });
          break;
        }
        if (Date.now() >= pollDeadline) break;
        await _sleep(_jitter(10_000, 3_000));
      }
    }

    if (!foundWorkflowId) {
      throw Object.assign(new Error("Timed out waiting for workflow to appear in inventory"), { code: "TIMEOUT" });
    }

    // Poll as29s for signed video URL
    let videoUrl = null;
    while (Date.now() < pollDeadline) {
      const mode = await _getWizMode(page);
      let wfPayload;
      try {
        wfPayload = await _doRpc(page, { projectId, mode, rpcId: "as29s", input: [foundWorkflowId] });
      } catch (err) {
        if (err.code === "BLOCKED") throw err;
        // Transient RPC error — keep polling
        wfPayload = null;
      }
      if (wfPayload) {
        const detail = parseWorkflowDetail(wfPayload);
        if (detail?.error === "BLOCKED") {
          throw Object.assign(new Error(FLOW_BLOCKED), { code: "BLOCKED" });
        }
        if (detail?.videoUrl && isValidSignedVideoUrl(detail.videoUrl)) {
          videoUrl = detail.videoUrl;
          break;
        }
      }
      if (Date.now() >= pollDeadline) break;
      await _sleep(_jitter(10_000, 3_000));
    }

    if (!videoUrl) {
      throw Object.assign(new Error("Timed out waiting for video URL"), { code: "TIMEOUT" });
    }

    // Download
    onProgress?.("download");
    const response = await page.request.get(videoUrl);
    if (!response.ok()) {
      const status = response.status();
      const code = status === 410 || status === 403 ? "EXPIRED" : "DOWNLOAD";
      throw Object.assign(new Error(`Video download failed: HTTP ${status}`), { code });
    }
    const body = await response.body();
    if (!body || body.length < MIN_VIDEO_BYTES) {
      throw Object.assign(
        new Error(`Downloaded file too small (${body?.length ?? 0} bytes)`),
        { code: "DOWNLOAD" },
      );
    }

    await writeFile(destPath, body);
    onProgress?.("done");
    return { videoUrl, workflowId: foundWorkflowId, destPath };
  }

  return { inventory, character, generateClip };
}
