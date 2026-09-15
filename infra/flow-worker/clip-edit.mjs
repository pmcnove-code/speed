const token = value => String(value || '').toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}']/gu,'');

// Trim only confirmed outer padding, never pauses within the spoken script.
export function clipEditPlan(durationMs, caption = {}) {
  if (!Number.isFinite(durationMs) || durationMs < 3000) throw new Error('Invalid source clip duration');
  const words=String(caption.spoken ?? caption.text ?? '').trim().split(/\s+/).filter(Boolean);
  const timings=caption.words || [];
  const aligned=!caption.hold && words.length>0 && timings.length===words.length && timings.every((word,i)=>
    token(word.word || word.punctuated_word)===token(words[i]) &&
    Number.isFinite(word.start) && Number.isFinite(word.end) && word.start>=0 && word.end>word.start &&
    word.end*1000<=durationMs && (i===0 || word.start>=timings[i-1].end));
  let startMs=0,endMs=durationMs;
  if(aligned) {
    // Leave generous handles around speech; round outward to 24 fps frames.
    startMs=Math.max(0,Math.floor((timings[0].start*1000-250)/(1000/24))*(1000/24));
    endMs=Math.min(durationMs,Math.ceil((timings.at(-1).end*1000+350)/(1000/24))*(1000/24));
    if(endMs-startMs<3000) {startMs=0;endMs=durationMs;}
  }
  startMs=Math.floor(startMs);endMs=Math.ceil(endMs);
  const adjusted={...caption,words:timings.map(w=>({...w,start:w.start-startMs/1000,end:w.end-startMs/1000}))};
  if(caption.phrases) adjusted.phrases=caption.phrases.map(p=>({...p,startMs:Math.max(0,p.startMs-startMs),endMs:Math.min(endMs-startMs,p.endMs-startMs)})).filter(p=>p.endMs>p.startMs);
  return {sourceStartMs:startMs,durationMs:endMs-startMs,caption:adjusted,trimmedMs:durationMs-(endMs-startMs),timingVerified:aligned};
}
