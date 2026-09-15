import { buildV33Prompt } from "./clip-v33.mjs";

export function normalizeSceneDirection(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Check your scene description.");
  const setting = String(value.setting || "").trim();
  if (setting.length > 1600) throw new Error("Keep the scene description under 1600 characters.");
  const characterDescription = String(value.characterDescription || "").trim();
  if(characterDescription.length > 500)throw new Error("Keep the character description under 500 characters.");
  const transition = value.transition || "dissolve";
  if (!["dissolve", "cut", "fade"].includes(transition)) throw new Error("Choose a supported scene transition.");
  return setting || characterDescription || transition !== "dissolve" ? { setting, transition, ...(characterDescription ? {characterDescription} : {}) } : null;
}

/** Scene descriptions remain metadata; the reference image owns the scene. */
export function buildScenePrompt(spoken, _scene) {
  return buildV33Prompt(spoken);
}
