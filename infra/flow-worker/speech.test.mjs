import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSpeechMatches,
  clearTranscriptCache,
  heardMatchesReelCopy,
  matchingOtherClipId,
  speechMatchesCopy,
  transcribeClipFile,
} from "./speech.mjs";

describe("speechMatchesCopy", () => {
  it("rejects generated stutters, including come comes, but preserves scripted repetition", () => {
    assert.equal(speechMatchesCopy("Whatever comes next.", "Whatever come comes next."), false);
    assert.equal(speechMatchesCopy("Step outside today.", "Step step outside today."), false);
    assert.equal(speechMatchesCopy("It is very very good.", "It is very very good."), true);
  });
  it("accepts the copy word for word", () => {
    assert.equal(
      speechMatchesCopy("Your gut is not lazy.", "Your gut is not lazy."),
      true,
    );
  });

  it("accepts contractions but rejects added filler", () => {
    assert.equal(
      speechMatchesCopy("Your gut isn't lazy.", "Your gut is not lazy."),
      true,
    );
  });

  it("rejects a different line even on the same topic", () => {
    assert.equal(
      speechMatchesCopy(
        "Your gut is not lazy. It is inflamed from seed oils.",
        "Pills don't fix plates. Salad isn't fuel.",
      ),
      false,
    );
  });

  it("rejects a paraphrase that drops the actual words", () => {
    assert.equal(
      speechMatchesCopy("Ask me what I eat.", "Let me tell you about my diet today."),
      false,
    );
  });

  it("rejects extra ad-lib after the line", () => {
    assert.equal(
      speechMatchesCopy(
        "Ask me what I eat.",
        "Ask me what I eat. Welcome back to the protocol, smash follow for more ribeyes.",
      ),
      false,
    );
  });

  it("rejects the right words in the wrong order", () => {
    assert.equal(
      speechMatchesCopy(
        "Coffee was my breakfast. The doctor named it low T.",
        "The doctor named it low T. Coffee was my breakfast.",
      ),
      false,
    );
  });

  it("treats a silent hold as matching when almost nothing is said", () => {
    assert.equal(speechMatchesCopy("", "", { hold: true }), true);
    assert.equal(speechMatchesCopy("", "EMPTY", { hold: true }), true);
    assert.equal(speechMatchesCopy("", "Pills don't fix plates.", { hold: true }), false);
  });
});

describe("matchingOtherClipId", () => {
  it("classifies a previous reel line without accepting it as the current line", () => {
    const clips = [
      { id: "C01", spoken: "They stripped the fat and called it health. Your body calls it theft." },
      { id: "C02", spoken: "Before the sun, already drained. Coffee was my breakfast." },
    ];
    assert.equal(
      matchingOtherClipId(
        "They stripped the fat and called it health. Your body calls it theft.",
        clips[1],
        clips,
      ),
      "C01",
    );
    assert.equal(speechMatchesCopy(clips[1].spoken, clips[0].spoken), false);
  });
});

describe("transcript identity cache", () => {
  it("transcribes each MP4 hash once and never accepts another clip's line", async () => {
    clearTranscriptCache();
    const dir = await mkdtemp(join(tmpdir(), "speech-cache-test-"));
    const file = join(dir, "take.mp4");
    await writeFile(file, Buffer.from("same-rendered-asset"));
    let calls = 0;
    let verifyCalls = 0;
    const keys = {
      transcribe: async () => {
        calls += 1;
        return "They stripped the fat and called it health.";
      },
      verifyTranscribe: async () => {
        verifyCalls += 1;
        return "unused";
      },
    };
    try {
      await transcribeClipFile(file, keys);
      await transcribeClipFile(file, keys);
      assert.equal(calls, 1);
      await assert.rejects(
        assertSpeechMatches(
          file,
          { id: "C02", spoken: "Coffee was my breakfast." },
          keys,
          [
            { id: "C01", spoken: "They stripped the fat and called it health." },
            { id: "C02", spoken: "Coffee was my breakfast." },
          ],
        ),
        (error) =>
          error?.code === "SPEECH" &&
          error?.wrongFile === true &&
          error?.matchedClipId === "C01",
      );
      assert.equal(verifyCalls, 0);

      const ambiguousFile = join(dir, "ambiguous.mp4");
      await writeFile(ambiguousFile, Buffer.from("different-rendered-asset"));
      const verified = await assertSpeechMatches(
        ambiguousFile,
        { id: "C03", spoken: "Your body calls it theft in my village." },
        {
          transcribe: async () => "Your body calls it.",
          verifyTranscribe: async () => {
            verifyCalls += 1;
            return "Your body calls it theft in my village.";
          },
        },
        [],
      );
      assert.equal(verified, "Your body calls it theft in my village.");
      assert.equal(verifyCalls, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
      clearTranscriptCache();
    }
  });
});

describe("heardMatchesReelCopy", () => {
  it("accepts a take from this reel even when the beat string is a leftover line", () => {
    const corpus =
      "Your 5 AM alarm isn't discipline. It's your body running on fumes. I used to wake up wrecked.";
    assert.equal(
      heardMatchesReelCopy(
        "Your 5AM alarm isn't discipline, it's your body running on fumes. I used to wake",
        corpus,
      ),
      true,
    );
    assert.equal(
      heardMatchesReelCopy(
        "Your 5AM alarm isn't discipline, it's your body running on fumes. I used to wake",
        "The king is dead. Long live the king. They crowned a new king.",
      ),
      false,
    );
    assert.equal(
      heardMatchesReelCopy(
        "They stripped the fat and called it health. Your body calls it theft. In my vill",
        "Your 5 AM alarm isn't discipline. It's your body running on fumes. I used to wake up tired.",
      ),
      false,
    );
  });
});

 it("rejects changed numbers, negations, filler and repeated phrases", () => {
  assert.equal(speechMatchesCopy("I'm 190 now. No pills.", "I'm 100 now. No pills."), false);
  assert.equal(speechMatchesCopy("I do not need pills.", "I do need pills."), false);
  assert.equal(speechMatchesCopy("I used to wake up tired.", "I used to wake up wake up tired."), false);
  assert.equal(speechMatchesCopy("Your gut isn't lazy.", "Um your gut is not lazy."), false);
  assert.equal(speechMatchesCopy("That's the whole secret.", "That’s the whole secret."), true);
  assert.equal(speechMatchesCopy("Hi.", "Hi."), true);
});

it("accepts number notation without accepting a different number", () => {
 assert.equal(speechMatchesCopy("I'm 190 now.", "I'm one hundred ninety now."), true);
 assert.equal(speechMatchesCopy("I was sixty.", "I was 60."), true);
 assert.equal(speechMatchesCopy("I'm 190 now.", "I'm one hundred now."), false);
});

it("does not lose a decimal point during speech normalization", () => {
 assert.equal(speechMatchesCopy("190.5", "one hundred ninety point five"), true);
 assert.equal(speechMatchesCopy("190.5", "one hundred ninety five"), false);
});
it('accepts equivalent uncommon contractions and number pronunciation without overlooking missing endings',()=>{
 const expected="Guy next to me's eating a gas station hot dog. He watches me open my cooler. Ribeye.";
 assert.equal(speechMatchesCopy(expected,'Guy next to me is eating a gas station hot dog. He watches me open my cooler. Ribeye.'),true);
 assert.equal(speechMatchesCopy(expected,'Guy next to me is eating a gas station hot dog. He watches me open my cooler.'),false);
 assert.equal(speechMatchesCopy(expected,'Guy next to me is eating a gas station hot dog. He watches me open my cooler water. Ribeye.'),false);
 assert.equal(speechMatchesCopy("I'm 190 now. No pills.","I'm one hundred and ninety now. No pills."),true);
 assert.equal(speechMatchesCopy("I'm 190 now. No pills.","I'm one hundred and ninety now."),false);
 assert.equal(speechMatchesCopy('Steak and eggs.','Steak eggs.'),false);
 assert.equal(speechMatchesCopy("He's gone.",'He has gone.'),true);
 assert.equal(speechMatchesCopy('He is gone.','He has gone.'),false);
});
it('reports the complete mismatch including the end of the clip and second-verification activity',async()=>{
 clearTranscriptCache();const dir=await mkdtemp(join(tmpdir(),'speech-tail-'));const file=join(dir,'take.mp4');await writeFile(file,'tail-test');
 const expected="Guy next to me's eating a gas station hot dog. He watches me open my cooler. Ribeye.";const heard='Guy next to me is eating a gas station hot dog. He watches me open my cooler water.';const logs=[];
 try{
  await assert.rejects(assertSpeechMatches(file,{id:'C02',spoken:expected},{transcribe:async()=>heard,verifyTranscribe:async()=>heard,onVerification:line=>logs.push(line)}),e=>e.message.includes('cooler water.')&&e.message.includes('Ribeye.'));
  assert.equal(logs.length,2);
 }finally{await rm(dir,{recursive:true,force:true});clearTranscriptCache();}
});
it('uses a different available recognition model for the second pass',async()=>{
 const {secondarySpeechModel}=await import('./speech.mjs');
 assert.equal(secondarySpeechModel('nova-3'),'nova-2');assert.equal(secondarySpeechModel('nova-2'),'nova-3');
});
