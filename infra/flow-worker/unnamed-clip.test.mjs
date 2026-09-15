import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from './browser.mjs';
import {listClipTitleButtons,openFinishedClip} from './flow.mjs';

test('opens an unnamed newest tile by verified asset identity instead of the last grid position', async () => {
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    const project='https://flow.google.com/project/11111111-1111-4111-8111-111111111111';
    const prior=`${project}/edit/22222222-2222-4222-8222-222222222222`;
    const fresh=`${project}/edit/33333333-3333-4333-8333-333333333333`;
    await page.route('**/*', route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('/edit/') ? '<canvas width="320" height="480"></canvas><button>Download media</button>' : `<style>flow-grid-tile-container{display:inline-block;width:180px;height:320px}</style><flow-grid-tile-container aria-label="" onclick="location.href='${fresh}'"><flow-video-tile>play_circle</flow-video-tile></flow-grid-tile-container><flow-grid-tile-container aria-label="Old clip" onclick="location.href='${prior}'"><flow-video-tile>play_circle</flow-video-tile></flow-grid-tile-container>`}));
    await page.goto(project);
    const titles=await listClipTitleButtons(page);
    assert.ok(titles.some(t=>t.name===''));
    await page.evaluate(()=>{for(const text of ['Ingredient add voice_selection','Ingredient add accessibility_new','Back button to go to previous page arrow_back']){const b=document.createElement('button');b.textContent=text;document.body.append(b);}});
    assert.deepEqual((await listClipTitleButtons(page)).map(t=>t.name),['','Old clip']);
    const opened=await openFinishedClip(page,'Cooler, grill, salt, water.',1,[{name:'Old clip'}],[prior],1);
    assert.equal(opened?.url,fresh);
  }finally{await browser.close();}
});
