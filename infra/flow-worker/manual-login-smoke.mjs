import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {CHROME,manualChromeArgs,startProcess,stopProcess,desktopFrame,desktopInput,closeManualChrome} from './manual-desktop.mjs';
const display=':98';const profile=await mkdtemp(join(tmpdir(),'manual-smoke-'));
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Manual desktop test</title><input autofocus oninput="document.title=this.value"><script>document.cookie="manual_test=retained; max-age=3600; path=/"</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
let desktop,chrome,context;
try{
 desktop=startProcess('Xvfb',[display,'-screen','0','1440x900x24','-ac','-nolisten','tcp'],display);
 await new Promise(r=>setTimeout(r,800));
 chrome=startProcess(CHROME,manualChromeArgs(profile,url),display);
 await new Promise(r=>setTimeout(r,3500));
 assert.equal(chrome.exitCode,null);
 const frame=await desktopFrame(display);assert.equal(frame[0],255);assert.equal(frame[1],216);assert.ok(frame.length>1000);
 await desktopInput(display,{type:'text',text:'Manual input works'});
 await new Promise(r=>setTimeout(r,300));
 const ids=execFileSync('xdotool',['search','--name','Manual input works'],{env:{...process.env,DISPLAY:display},encoding:'utf8'});assert.ok(ids.trim());
 await closeManualChrome(chrome,display);chrome=null;
 context=await chromium.launchPersistentContext(profile,{executablePath:CHROME,headless:true,args:['--no-sandbox','--password-store=basic']});
 assert.ok((await context.cookies(url)).some(c=>c.name==='manual_test' && c.value==='retained'));
 console.log('PASS: native Chrome opens, desktop JPEG renders, human input reaches page, saved cookie survives handoff');
}finally{
 await context?.close();await stopProcess(chrome);await stopProcess(desktop);server.close();await rm(profile,{recursive:true,force:true});
}
