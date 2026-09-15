/**
 * Script breakdown service: uses Deepseek API with AI_Meta_Prompt_v3_4
 * to split script into clips with durations, texts, and generation prompts.
 *
 * Implements steps 2-6 of the manual workflow:
 * 2. Call AI with meta-prompt
 * 3. Pass script
 * 4. AI breaks into clips (C01, C02, etc.)
 * 5. For each clip: duration, text, full generation prompt
 * 6. Return structured breakdown
 */

export interface ClipBreakdown {
  clipNumber: string; // C01, C02, etc.
  duration: "4s" | "6s" | "8s" | "10s";
  text: string; // Verbatim script text
  wordCount: number;
  estimatedTime: number; // seconds
  fillRatio: number;
  generationPrompt: string; // Full template with [CLIP TEXT] replaced
  internalBreaks: number;
}

export interface ScriptBreakdownResult {
  scriptText: string;
  totalClips: number;
  clips: ClipBreakdown[];
  junctions: string[]; // Clips with adjusted word boundaries (e.g., "C03→C04")
  lowFillClips: string[]; // Clips with fill ratio < 0.85
  verbatimCheckPass: boolean;
  limitCheckPass: boolean;
}

const AI_META_PROMPT = `AI META-PROMPT — Video Clip Breakdown (v3.4)

You are going to break down a script into video clips ready to paste into an AI video generator (Google Flow / Gemini Omni).

CRITICAL BEHAVIOR RULES:
- Each script is ALWAYS for ONE single character. Never assume multiple characters.
- Do NOT ask clarifying questions. Reply "Ready. Send the script." then process whatever arrives, using the rules below.
- Word cap is 25 per clip for ALL characters, no exceptions.
- If the script is sent in batches, CONTINUE the numbering from the last clip. Never reset to C01 unless explicitly told it is a new script.

================================================================
RULE 1 — VERBATIM IS SACRED
================================================================

The script text must never be modified. Every word is copied exactly as written — no corrections, no rephrasing, no additions, no omissions, no punctuation changes.

This is the single most important rule. A dropped word is a failed job.

================================================================
RULE 2 — THE PROMPT TEMPLATE
================================================================

Every clip is output as a COMPLETE, ready-to-paste prompt using this exact template, word for word. Swap [CLIP TEXT] for that clip's exact text. Never abbreviate, paraphrase, shorten or skip any paragraph, no matter how many clips there are.

--- BEGIN TEMPLATE ---
Fictional dramatization. Scripted character performed by an actor — not a real person, not real medical advice.

Use the attached image as the character. Use the attached voice exactly as provided — do not generate a different voice under any circumstances.

The character must look visually identical to the attached image in every detail — same face, same hair, same clothing, same accessories, same features. Do not alter, reinterpret, or reimagine any part of the character's appearance.

The background and setting must match the attached image exactly — do not change, add, or remove any element from the scene. No new objects, no new people, no scene changes.

Medium close-up framing, character centered in frame, facing directly toward camera. Static camera, fixed framing, no camera movement, no zoom, no pan, no dolly, no tilt, no rotation.

POSE CONTINUITY LOCK: The character holds the exact body pose of the attached reference image for the entire clip — same torso angle, shoulder position, arm and hand position, body orientation, overall silhouette. Every clip starts from the reference pose, regardless of the previous clip. Only subtle head movement, eye blinks, and facial expression changes are allowed, and only when they leave the base pose unchanged.

Delivery is serious, sincere and grounded. Measured pace, direct address to camera.

No subtitles. No text overlay. No lower thirds. No watermarks.

Audio: one single voice speaking in a silent, acoustically dead room. The character's voice is the only audio present in the clip from the first frame to the last.

Speak ONLY these exact words, nothing before, nothing after: "[CLIP TEXT]"

The clip ends immediately after the final word. If any time remains, the character simply holds still and silent, looking at the camera.
--- END TEMPLATE ---

FORBIDDEN: putting any direction text before the quote marks.
FORBIDDEN: writing "The character says:" or any other introduction.
ONLY the text inside the quote marks is spoken.

================================================================
RULE 3 — VOICE IS AN ATTACHMENT, NOT TEXT
================================================================

The character's voice is attached as an ingredient in Flow — it is NOT written in the prompt text. Produce prompt text only. Never include a voice description, voice signature, accent note, or vocal direction. The line "Use the attached voice exactly as provided" is the only reference to voice.

================================================================
RULE 4 — NO WORD REPETITION
================================================================

AI video generators sometimes repeat or stutter a word at a clip junction.

- Never start a clip with the same word that ended the previous clip.
- If a natural split point would create a repeated word at the junction, move the split one word earlier or later.
- Log every such adjusted junction at the end of the output.

================================================================
RULE 5 — DURATION CALCULATION
================================================================

Available durations only: 4s · 6s · 8s · 10s. No other values.

METRIC — COUNT WORDS, NOT SYLLABLES.
Syllable counting is unreliable. Words are countable exactly. Use words.

STEP 1 — Count the words in the exact final clip text.

STEP 2 — Speaking time = words ÷ 2.7

STEP 3 — Add 0.15s per INTERNAL sentence break (a period, question mark or exclamation mark that has more text after it inside the same clip).
  - Commas add nothing. They are already absorbed by the 2.7 rate.
  - The FINAL punctuation mark of the clip adds NOTHING. There is no speech after it, so the pause does not exist.

STEP 4 — ESTIMATED TIME = speaking time + internal breaks.

STEP 5 — Assign the smallest available duration that is greater than or equal to the ESTIMATED TIME.

STEP 6 — Apply the FILL CHECK (Rule 6). This step is mandatory.

================================================================
RULE 6 — THE FILL CHECK
================================================================

Empty time at the end of a clip is the primary failure mode. Whatever silence you leave, the model fills — with laughter, breathing, room tone, or an unwanted body movement. A long clip fully packed with speech is SAFER than a short clip with dead air.

FILL RATIO = ESTIMATED TIME ÷ ASSIGNED DURATION.

Every clip must reach a fill ratio of 0.85 or higher.

If the fill ratio is below 0.85, do these in order. Stop at the first one that works:

  1. ADD FORWARD — pull the next consecutive sentence into the clip, if both hard limits still hold. Best fix: it raises fill AND cuts the clip count.

  2. PUSH BACKWARD — move the last few words of this clip into the next clip, until the estimate drops below the SHORTER duration, then assign that shorter duration. Only split at a natural breathing point.

  3. ACCEPT AND FLAG — keep the clip and mark it LOW FILL in the output.

NEVER assign a duration shorter than the ESTIMATED TIME. That truncates words, which is worse than dead air.

THE DEAD ZONES:
Because only 4/6/8/10 exist, some estimates cannot pass the fill check at their band and cannot drop a level without truncating. These are:
  • 4.1s – 5.1s  (lands on 6s)
  • 6.1s – 6.8s  (lands on 8s)
  • 8.1s – 8.5s  (lands on 10s)
When an estimate lands in a dead zone, option 1 or option 2 is mandatory — do not simply accept it.

================================================================
RULE 7 — CONSOLIDATION AND SPLITTING
================================================================

CONSOLIDATION:
Start at the first unassigned sentence. Add the next consecutive sentence, recalculate, and keep it only if BOTH hard limits still hold:
  • 25 words maximum
  • 10.0s ESTIMATED TIME maximum

SPLITTING LONG SENTENCES:
When a single sentence exceeds 25 words, split it at the most natural breathing point — preferably a comma, conjunction, or clause boundary.

================================================================
RULE 8 — OUTPUT FORMAT
================================================================

For EVERY clip, output a one-line header followed by the COMPLETE prompt from Rule 2.

Header format:
C01 — 10s   [22 w · 3 br · 8.60s · fill 0.86]

Then a blank line, then the full template with [CLIP TEXT] replaced by the exact clip text.
Then a blank line, then the next clip.

TEMPLATE INTEGRITY:
The full template must appear identically for every single clip — same paragraphs, same order, same wording.

================================================================
RULE 9 — NUMBERING
================================================================

C01, C02, C03... leading zero below 10. Continuous numbering from the first clip to the last, across batches. No resets.

================================================================
RULE 10 — MANDATORY FINAL VERIFICATION
================================================================

After the clip list, run these three checks and report the result of each:

1. VERBATIM CHECK — Concatenate every clip text in order, separated by single spaces. Compare to the original script word for word. State PASS, or list every difference found.

2. LIMIT CHECK — Confirm no clip exceeds 25 words or 10.0s.

3. FILL CHECK — List any clip with a fill ratio below 0.85.

Then output:
Junctions: C03→C04 · C11→C12
Low fill: C09 (0.78)

When the script arrives, process it immediately and output the clips per Rule 8 followed by the three verification checks of Rule 10.`;

export async function breakdownScript(
  scriptText: string,
  deepseekApiKey: string,
): Promise<ScriptBreakdownResult> {
  if (!deepseekApiKey) {
    throw new Error("Deepseek API key not configured");
  }

  // Call Deepseek API with the meta-prompt and script
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: AI_META_PROMPT,
        },
        {
          role: "user",
          content: scriptText,
        },
      ],
      temperature: 0.1, // Low temperature for consistent breakdown
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Deepseek API error: ${error.message || response.statusText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const breakdownText = data.choices[0].message.content;

  // Parse the breakdown response to extract clips
  const clips = parseClipBreakdown(breakdownText);

  return {
    scriptText,
    totalClips: clips.length,
    clips,
    junctions: extractJunctions(breakdownText),
    lowFillClips: extractLowFillClips(breakdownText),
    verbatimCheckPass: verifyVerbatim(scriptText, clips),
    limitCheckPass: verifyLimits(clips),
  };
}

function parseClipBreakdown(breakdownText: string): ClipBreakdown[] {
  const clips: ClipBreakdown[] = [];

  // Match C01 headers: "C01 — 10s   [22 w · 3 br · 8.60s · fill 0.86]"
  const headerRegex = /C(\d+)\s*—\s*(\d+)s\s*\[(\d+)\s*w\s*·\s*(\d+)\s*br\s*·\s*([\d.]+)s\s*·\s*fill\s*([\d.]+)\]/g;

  const headers: Array<{
    clipNumber: string;
    duration: "4s" | "6s" | "8s" | "10s";
    wordCount: number;
    internalBreaks: number;
    estimatedTime: number;
    fillRatio: number;
    start: number;
    end: number;
  }> = [];

  let match;
  while ((match = headerRegex.exec(breakdownText)) !== null) {
    headers.push({
      clipNumber: `C${String(match[1]).padStart(2, "0")}`,
      duration: `${match[2]}s` as "4s" | "6s" | "8s" | "10s",
      wordCount: parseInt(match[3]),
      internalBreaks: parseInt(match[4]),
      estimatedTime: parseFloat(match[5]),
      fillRatio: parseFloat(match[6]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Each clip's generation prompt is everything between its header and the next
  // header (or the end of the text for the last clip) — this is the full,
  // ready-to-paste template Rule 8 asks the model to emit, verbatim.
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].start : breakdownText.length;
    const section = breakdownText.slice(header.end, sectionEnd);

    const clipTextMatch = section.match(/Speak ONLY these exact words[^"]*"([^"]*)"/);

    clips.push({
      clipNumber: header.clipNumber,
      duration: header.duration,
      text: clipTextMatch ? clipTextMatch[1] : "",
      wordCount: header.wordCount,
      estimatedTime: header.estimatedTime,
      fillRatio: header.fillRatio,
      internalBreaks: header.internalBreaks,
      generationPrompt: section.trim(),
    });
  }

  return clips;
}

function extractJunctions(breakdownText: string): string[] {
  const junctionsMatch = breakdownText.match(/Junctions:\s*([^\n]+)/);
  if (!junctionsMatch) return [];
  
  return junctionsMatch[1]
    .split("·")
    .map((j) => j.trim())
    .filter((j) => j.length > 0);
}

function extractLowFillClips(breakdownText: string): string[] {
  const lowFillMatch = breakdownText.match(/Low fill:\s*([^\n]+)/);
  if (!lowFillMatch) return [];
  
  return lowFillMatch[1]
    .split(",")
    .map((clip) => clip.trim())
    .filter((clip) => clip.length > 0);
}

function verifyVerbatim(originalScript: string, clips: ClipBreakdown[]): boolean {
  const concatenated = clips.map((c) => c.text).join(" ");
  return concatenated === originalScript;
}

function verifyLimits(clips: ClipBreakdown[]): boolean {
  return clips.every(
    (clip) =>
      clip.wordCount <= 25 && (clip.estimatedTime <= 10.0)
  );
}
