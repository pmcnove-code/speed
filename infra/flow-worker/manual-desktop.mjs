import {spawn} from 'node:child_process';
import {once} from 'node:events';
export const DESKTOP={width:1440,height:900};
export const CHROME=process.env.FLOW_CHROME_PATH || '/usr/bin/google-chrome-stable';
export function manualChromeArgs(profile,url){
 return [`--user-data-dir=${profile}`,'--no-sandbox','--disable-dev-shm-usage','--password-store=basic','--no-first-run','--no-default-browser-check','--window-position=0,0',`--window-size=${DESKTOP.width},${DESKTOP.height}`,url];
}
export function startProcess(command,args,display){
 const child=spawn(command,args,{env:{...process.env,DISPLAY:display},stdio:['ignore','ignore','ignore']});
 child.on('error',()=>{});
 return child;
}
export async function stopProcess(child){
 if(!child || !child.pid || child.exitCode!==null || child.signalCode)return;
 const ended=once(child,'exit').catch(()=>{});
 child.kill('SIGTERM');
 let timer;
 await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(resolve,8000);})]);
 clearTimeout(timer);
 if(child.exitCode===null && !child.signalCode){child.kill('SIGKILL');await ended;}
}
function command(name,args,display,input){
 return new Promise((resolve,reject)=>{
  const child=spawn(name,args,{env:{...process.env,DISPLAY:display},stdio:['pipe','pipe','ignore']});
  const chunks=[];let size=0;
  const timer=setTimeout(()=>child.kill('SIGKILL'),8000);
  child.stdout.on('data',part=>{size+=part.length;if(size>8*1024*1024)child.kill('SIGKILL');else chunks.push(part);});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Remote desktop command could not start.'));});
  child.on('exit',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks)):reject(new Error('Remote desktop command failed. Reopen Sign in to Flow.'));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export function desktopFrame(display){
 return command('ffmpeg',['-nostdin','-loglevel','error','-f','x11grab','-video_size',`${DESKTOP.width}x${DESKTOP.height}`,'-i',display,'-frames:v','1','-q:v','5','-f','image2pipe','-vcodec','mjpeg','pipe:1'],display);
}
export function desktopInputArgs(body={}){
 const type=String(body.type||'');
 if(['click','dblclick','move','down','up'].includes(type)){
  if(!Number.isFinite(Number(body.x)) || !Number.isFinite(Number(body.y)))throw new Error('Invalid pointer coordinates');
  const point=(v,max)=>String(Math.round(Math.max(0,Math.min(max-1,Number(v)*max))));
  const args=['mousemove',point(body.x,DESKTOP.width),point(body.y,DESKTOP.height)];
  if(type==='click')args.push('click','1');
  if(type==='dblclick')args.push('click','--repeat','2','--delay','100','1');
  if(type==='down')args.push('mousedown','1');if(type==='up')args.push('mouseup','1');
  return args;
 }
 if(type==='wheel'){
  const delta=Number(body.dy)||Number(body.dx)||0;if(!delta)return [];
  return ['click','--repeat',String(Math.min(8,Math.max(1,Math.ceil(Math.abs(delta)/100)))),String(body.dy?(delta>0?5:4):(delta>0?7:6))];
 }
 if(type==='text')return ['type','--clearmodifiers','--file','-'];
 if(type==='key'){
  const aliases={Enter:'Return',Backspace:'BackSpace',ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',' ':'space',Escape:'Escape',Delete:'Delete',Tab:'Tab',Home:'Home',End:'End',PageUp:'Page_Up',PageDown:'Page_Down'};
  const raw=String(body.key||'');
  if([...raw].length===1 && !body.ctrlKey && !body.metaKey && !body.altKey)return ['type','--clearmodifiers','--file','-'];
  if(['Meta','Control','Alt','Shift','OS'].includes(raw))return [];
  const key=aliases[raw] || (/^[a-zA-Z0-9]$/.test(raw)?raw:null);if(!key)return [];
  return ['key','--clearmodifiers',[body.ctrlKey||body.metaKey?'ctrl':'',body.altKey?'alt':'',body.shiftKey?'shift':'',key].filter(Boolean).join('+')];
 }
 return [];
}
export async function desktopInput(display,body){
 const args=desktopInputArgs(body);
 if(args.length)await command('xdotool',args,display,args[0]==='type'?String(body.type==='text'?body.text||'':body.key||'').slice(0,16000):undefined);
 return {ok:true};
}

export async function closeManualChrome(child,display){
 if(!child || child.exitCode!==null || child.signalCode)return;
 for(let n=0;n<6;n++){
  await command('xdotool',['key','--clearmodifiers','ctrl+shift+w'],display);
  await new Promise(resolve=>setTimeout(resolve,500));
  if(child.exitCode!==null || child.signalCode)return;
 }
 throw new Error('Close the Chrome windows in the desktop, then save the Flow session again.');
}
