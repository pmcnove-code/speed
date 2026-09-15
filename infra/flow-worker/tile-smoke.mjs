/** Real-browser regression fixture for Flow's custom video tiles; no paid requests. */
import { renderReadyToOpen } from "./render-ready.mjs";
import assert from "node:assert/strict";
import { chromium } from "./browser.mjs";
import { generationDomSnapshot, listClipTitleButtons, clickNamedClipTitle, editorHasPlayableMedia, waitForOutput, openFinishedClip } from "./flow.mjs";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setContent(`
    <style>flow-grid-tile-container {display:inline-block;width:141px;height:250px}</style>
    <main>
      <flow-grid-tile-container aria-label="African Elder"><flow-character-tile>Character</flow-character-tile></flow-grid-tile-container>
      <flow-grid-tile-container aria-label="Character speaking fresh start" onclick="document.body.dataset.opened='video'">
        <flow-video-tile><span>play_circle</span><div role="button" style="display:none">play_circle Entire long prompt</div></flow-video-tile>
      </flow-grid-tile-container>
      <flow-grid-tile-container aria-label="Hidden old video" style="display:none"><flow-video-tile>play_circle</flow-video-tile></flow-grid-tile-container>
      <button aria-label="Start generation">arrow_forward</button>
    </main>`);
  const titles = await listClipTitleButtons(page);
  assert.deepEqual(titles.map(t => t.name), ["Character speaking fresh start"]);
  assert.equal((await generationDomSnapshot(page)).playCount, 1);
  assert.equal(await clickNamedClipTitle(page, titles[0].name), true);
  assert.equal(await page.locator("body").getAttribute("data-opened"), "video");
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.id = 'changing-controls';
    document.body.append(panel);
    window.controlTimer = setInterval(() => {
      panel.innerHTML = panel.childElementCount ? '' : '<button>Temporary action</button>'.repeat(40);
    }, 10);
  });
  const scanStart = Date.now();
  for (let i=0;i<20;i++) assert.ok((await listClipTitleButtons(page)).some(t=>t.name==='Character speaking fresh start'));
  assert.ok(Date.now()-scanStart<5000,'Changing controls must not stall title discovery');
  await page.evaluate(()=>{clearInterval(window.controlTimer);document.querySelector('#changing-controls').remove();});
  // Flow's progress tile can live outside main and still display play_circle.
  await page.setContent(`<style>flow-grid-tile-container{display:inline-block;width:141px;height:250px}</style>
    <flow-grid-tile-container aria-label="Character speaking near fire at …"><flow-video-tile>play_circle <span>24%</span></flow-video-tile></flow-grid-tile-container>
    <flow-grid-tile-container aria-label="Character speaking near fire at …" onclick="document.body.dataset.opened='second'"><flow-video-tile>play_circle</flow-video-tile></flow-grid-tile-container>`);
  const rendering = await generationDomSnapshot(page);
  assert.deepEqual(rendering.percents, [24]);
  assert.equal(rendering.generating, true);
  assert.equal(renderReadyToOpen(rendering, 1), false);
  await page.evaluate(() => document.querySelector("flow-video-tile span").remove());
  assert.equal(renderReadyToOpen(await generationDomSnapshot(page), 1), true);
  await clickNamedClipTitle(page, "Character speaking near fire at …", 1);
  assert.equal(await page.locator("body").getAttribute("data-opened"), "second");
  await page.setContent('<video style="width:200px;height:300px"></video><button>Download</button><span>00:10</span>');
  assert.equal(await editorHasPlayableMedia(page), false, "An empty video or duration label is not playable");
  await page.evaluate(() => {
    const video = document.querySelector('video');
    Object.defineProperties(video, { readyState: { value: 2 }, duration: { value: 10 } });
  });
  assert.equal(await editorHasPlayableMedia(page), true);
  await page.setContent('<canvas width="200" height="300"></canvas><button aria-label="Download media" disabled>download</button>');
  assert.equal(await editorHasPlayableMedia(page), false);
  await page.getByRole('button', {name:'Download media'}).evaluate(el=>el.disabled=false);
  assert.equal(await editorHasPlayableMedia(page), true);
  await page.locator('body').evaluate(el=>el.insertAdjacentHTML('beforeend','<div role="progressbar">24%</div>'));
  assert.equal(await editorHasPlayableMedia(page), false);
  // Keep a phantom extra tile visible longer than the old 18-second latch.
  // It must time out, never claim that an asset was opened or rendered.
  await page.setContent('<main><button>play_circle</button><canvas width="200" height="300"></canvas></main>');
  const notes=[];
  await assert.rejects(waitForOutput(page, note=>notes.push(note), "C05", 0, 0, 0, Date.now()+22000), error=>error.code === "TIMEOUT");
  assert.equal(notes.some(note=>note.includes("finished")), false);
  const project = 'https://flow.google.com/project/11111111-1111-4111-8111-111111111111';
  const asset = '22222222-2222-4222-8222-222222222222';
  const broken = '<flow-grid-tile-container aria-label="New replacement" style="display:block;width:141px;height:250px"><flow-video-tile>Failed\nThe video failed to load.</flow-video-tile></flow-grid-tile-container>';
  let visits=0;
  let persistentFailure=false;
  await page.route(project+'**',async route=>{
    if(route.request().url().includes('/edit/')) return route.fulfill({contentType:'text/html',body:'<canvas width="200" height="300"></canvas><button aria-label="Download media">download</button>'});
    visits++;
    await route.fulfill({contentType:'text/html',body:persistentFailure || visits===1 ? broken : `<flow-grid-tile-container aria-label="New replacement" style="display:block;width:141px;height:250px" onclick="location.href='${project}/edit/${asset}'"><flow-video-tile>play_circle</flow-video-tile></flow-grid-tile-container>`});
  });
  await page.goto(project);
  let opened='';const reloadNotes=[];
  await waitForOutput(page,note=>reloadNotes.push(note),'C01',0,0,0,Date.now()+30000,{markOpened:url=>{opened=url;},freeze:()=>{}});
  assert.equal(opened,project+'/edit/'+asset);
  assert.equal(visits,2,'Exactly one page reload recovered the existing clip');
  assert.ok(reloadNotes.some(note=>note.includes('reloading the video service')));
  const known = {openedAssetId:asset,markOpened:()=>{}};
  const pinned = await openFinishedClip(page, 'Dialogue absent from editor', 0, [], [], 0, known);
  assert.equal(pinned?.assetId,asset,'An already identified asset must not be reselected by script/title');
  assert.equal(visits,2,'Downloading the identified clip must not navigate back to the grid');
  persistentFailure=true;visits=0;
  await page.goto(project);
  await assert.rejects(waitForOutput(page,()=>{},'C01',0,0,0,Date.now()+30000),error=>error.code==='MEDIA_LOAD_FAILED');
  assert.equal(visits,3,'Persistent load failure stops after two reloads');
  console.log("Custom tile opening, duplicate titles, and 24% render readiness regressions passed");
} finally {
  await browser.close();
}
