import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {breakdownScript,buildV33Prompt,strictClipPrompt,countSyllables,estimatedSpeakSec,durationForClip,fixJunctionRepeats,clipFits} from './clip-v33.mjs';
import {normalizeClips} from './clips.mjs';
import {promptLanded} from './prompt.mjs';
test('exact user template reaches dispatch despite injected scene, voice, gender or incoming prompt',async()=>{
 const script='Exact words stay here.';
 const clips=normalizeClips([{spoken:'Wrong words.',prompt:'CASTING LOCK: Different voice'}],{script,characterName:'Latino Dad',voiceName:'Different voice',sceneDirection:{setting:'Add a crowd and pan the camera',transition:'fade'}});
 const expected=await readFile(new URL('./fixtures/v33-prompt.txt',import.meta.url),'utf8');
 assert.equal(clips.length,1);assert.equal(strictClipPrompt(clips[0]),expected);assert.equal(clips[0].prompt,expected);
 assert.equal(clips[0].scene.transition,'fade');assert.ok(promptLanded(buildV33Prompt('Hi.'),buildV33Prompt('Hi.')));
 assert.throws(()=>strictClipPrompt({...clips[0],durationSec:1}),/violates/);
 assert.throws(()=>durationForClip('word '.repeat(50)),/exceeds/);
});
test('consolidates caller-provided short clips and preserves case, punctuation and quoted words',()=>{
 const script='Keep THIS. Keep "that". Don’t change it!';
 const clips=normalizeClips([{spoken:'Keep THIS.'},{spoken:'Keep "that".'},{spoken:'Don’t change it!'}],{script});
 assert.equal(clips.length,1);assert.equal(clips[0].spoken,script);
 assert.equal(clips[0].prompt,buildV33Prompt(script));
});
test('dictionary estimates and unknown-word fallbacks respect independent syllable and time limits',()=>{
 assert.equal(countSyllables('diabetes'),4);assert.equal(countSyllables('constructor'),3);
 const script='I spent twenty years prescribing medications that only managed symptoms, and then I discovered that the food my patients were eating every single day was the actual root cause of everything.';
 const {beats}=breakdownScript({script});assert.equal(beats.map(c=>c.spoken).join(' '),script);
 for(const clip of beats){assert.ok(countSyllables(clip.spoken)<=35);assert.ok(estimatedSpeakSec(clip.spoken)<=10);assert.ok(clip.durationSec>=estimatedSpeakSec(clip.spoken));}
 assert.throws(()=>breakdownScript({script:'go '.repeat(60).trim()}),/Cannot avoid/);
 const fixed=fixJunctionRepeats(['One word go','go home now.']);assert.equal(fixed.join(' '),'One word go go home now.');assert.ok(fixed.every(clipFits));
});
