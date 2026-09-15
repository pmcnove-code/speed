import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeCharacterGender,assetGender,applyGenderLock} from '../../shared/flow/gender.mjs';
import {resolveFlowVoice,rankAvailableCharacters,rankAvailableVoices,FLOW_VOICE_PROFILES} from './voices.mjs';
import {recoveryForClip,restoreClipState} from './clip-state.mjs';

test('explicit gender overrides a conflicting persona, without reading dialogue',()=>{
 const female=resolveFlowVoice({name:'African Elder',characterGender:'female'});
 assert.equal(female.type,'Female');assert.equal(female.character,'Suburban Mom');
 assert.equal(resolveFlowVoice({name:'Farm Woman',characterGender:'female'}).character,'Farm Woman');
 assert.equal(resolveFlowVoice({name:'Farm Woman',characterGender:'male'}).type,'Male');
 assert.equal(resolveFlowVoice({name:'African Elder'}).character,'African Elder');
 assert.throws(()=>normalizeCharacterGender('anything'));assert.equal(normalizeCharacterGender(null),null);
});
test('locked character selection excludes opposite and unknown references',()=>{
 const female=resolveFlowVoice({name:'Suburban Mom',characterGender:'female'});
 assert.deepEqual(rankAvailableCharacters(female,['African Elder','Copy Studio','Female Doctor']),['Female Doctor']);
 assert.deepEqual(rankAvailableCharacters(female,['African Elder','Copy Studio']),[]);
 const male=resolveFlowVoice({name:'Doctor',characterGender:'male'});
 assert.deepEqual(rankAvailableCharacters(male,['Farm Woman','Female Doctor','Latino Dad']),['Latino Dad']);
 assert.equal(assetGender('Female Doctor',FLOW_VOICE_PROFILES),'female');
 assert.equal(assetGender('Unlabelled person',FLOW_VOICE_PROFILES),null);
 assert.equal(assetGender('Avatar Profile 10 - IBS/Skin Carnivore mei-quiet-glow',FLOW_VOICE_PROFILES),'female');
 assert.equal(assetGender('Avatar Profile 100',FLOW_VOICE_PROFILES),null);
});
test('locked voices never fall back across genders',()=>{
 const female=resolveFlowVoice({characterGender:'female'});
 assert.deepEqual(rankAvailableVoices(female,['Charon Male, lower pitch','Algieba Male, easy-going']),[]);
 assert.deepEqual(rankAvailableVoices(female,['Charon Male','Aoede Female, breezy']),['Aoede Female, breezy']);
 const male=resolveFlowVoice({characterGender:'male'});
 assert.deepEqual(rankAvailableVoices(male,['Aoede Female','Charon Male']),['Charon Male']);
});
test('casting lock does not rewrite spoken words or legacy prompts',()=>{
 const prompt='Fictional comedy sketch.\nSpeak ONLY these exact words, nothing before, nothing after: "My husband said she should come."';
 assert.equal(applyGenderLock(prompt,null),prompt);
 const locked=applyGenderLock(prompt,'male');assert.ok(locked.startsWith('CASTING LOCK: The single character is an adult man.'));
 assert.ok(locked.endsWith(prompt));
});
test('missing matching gender fails before paid dispatch instead of retrying wrong assets',()=>{
 const state=restoreClipState('C01',{});
 assert.equal(recoveryForClip(state,Object.assign(new Error('No matching female voice'),{code:'GENDER_MISSING'})).action,'fail');
 assert.equal(state.dispatchCount,0);
});
