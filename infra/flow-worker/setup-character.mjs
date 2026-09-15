import { hasChromeProfile, tryReadSession } from "./store.mjs";
import { setupFlowCharacter } from "./flow.mjs";

const accountId = process.argv[2];
const handle = process.argv[3] || "elder-emeka";
const avatarPath = process.argv[4] || "";

if (!accountId) {
  console.error("usage: node setup-character.mjs <accountId> [handle] [avatarPath]");
  process.exit(1);
}

const storageState = await tryReadSession(accountId);
if (!storageState && !(await hasChromeProfile(accountId))) {
  console.error(JSON.stringify({ ok: false, error: "no session" }));
  process.exit(1);
}

try {
  const result = await setupFlowCharacter(
    accountId,
    storageState,
    {
      personaHandle: handle,
      avatarPath: avatarPath || null,
    },
    { onProgress: (m) => console.error(m) },
  );
  const ok = Boolean(result.characterOk || result.listed);
  console.log(JSON.stringify({ ok, ...result }, null, 2));
  process.exit(ok ? 0 : 2);
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
