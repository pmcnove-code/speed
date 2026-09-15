import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualChromeArgs,desktopInputArgs} from './manual-desktop.mjs';
import {looksLoggedInToFlow} from './signed-in.mjs';
test('manual Chrome exposes no automation or remote debugging during sign-in',()=>{
 const args=manualChromeArgs('/tmp/example profile','https://flow.google.com/');
 assert.ok(args.includes('--user-data-dir=/tmp/example profile'));
 assert.ok(!args.some(a=>/remote-debugging|automation|headless|disable-web-security|ignore-certificate/.test(a)));
});
test('desktop pointer mapping, scrolling and editing shortcuts',()=>{
 assert.deepEqual(desktopInputArgs({type:'click',x:0.5,y:0.5}),['mousemove','720','450','click','1']);
 assert.deepEqual(desktopInputArgs({type:'key',key:'Backspace'}),['key','--clearmodifiers','BackSpace']);
 assert.deepEqual(desktopInputArgs({type:'key',key:'a',metaKey:true}),['key','--clearmodifiers','ctrl+a']);
 assert.throws(()=>desktopInputArgs({type:'click',x:'bad',y:0}));
 assert.deepEqual(desktopInputArgs({type:'text',text:'private'}),['type','--clearmodifiers','--file','-']);
 for(const key of ['@','!','é','A'])assert.deepEqual(desktopInputArgs({type:'key',key}),['type','--clearmodifiers','--file','-']);
 assert.deepEqual(desktopInputArgs({type:'key',key:'--bad'}),[]);
});
test('session confirmation accepts actual Flow .com but rejects login and landing pages',()=>{
 assert.equal(looksLoggedInToFlow('https://flow.google.com/','All media Characters Start creating'),true);
 assert.equal(looksLoggedInToFlow('https://flow.google.com/','Sign in with Google'),false);
 assert.equal(looksLoggedInToFlow('https://accounts.google.com/signin','New project'),false);
});
