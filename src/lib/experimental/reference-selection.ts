import { assetGender, type CharacterGender } from "../../../shared/flow/gender.mjs";
import { FLOW_VOICE_PROFILES } from "./flow-voices";
/** Select from saved reference inventory; copy text never participates in selection. */
export function selectAvailableReference<T extends { id: number; photo: { length: number } | null; name?: string; handle?: string }>(requested: T | null, available: T[], gender: CharacterGender | null = null, description = ""): T | null {
  const matches = (persona: T) => !gender || assetGender(`${persona.name || ""} ${persona.handle || ""}`, FLOW_VOICE_PROFILES) === gender;
  if (description.trim()) {
    const words = (text:string):string[] => text.toLowerCase().match(/[a-z0-9]+/g) || [];
    const wanted = words(description);
    const candidates = [...new Map([...(requested?[requested]:[]),...available].map(p=>[p.id,p])).values()]
      .filter(p=>p.photo?.length && matches(p)).map(persona=>{
        const keys=words(`${persona.name || ""} ${persona.handle || ""}`);
        const score=[...new Set(keys)].filter(word=>word.length>2 && wanted.includes(word)).length;
        return {persona,score};
      }).filter(p=>p.score>0).sort((a,b)=>b.score-a.score);
    if (!candidates.length || candidates[0].score===candidates[1]?.score)return null;
    return candidates[0].persona;
  }
  if (requested?.photo?.length && matches(requested)) return requested;
  return available.filter(persona => (persona.photo?.length || 0) > 0 && matches(persona)).sort((a, b) => a.id - b.id)[0] || null;
}
