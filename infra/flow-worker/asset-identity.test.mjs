import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assetIdFromEditUrl,
  candidateMatchesAsset,
  identifyNewEditAsset,
  minimumExpectedDurationMs,
  newlyAddedEditAssets,
} from "./asset-identity.mjs";

describe("Flow asset identity", () => {
  const oldUrl = "https://flow.google.com/project/project-1/edit/old-asset";
  const newUrl = "https://flow.google.com/project/project-1/edit/new-asset";

  it("extracts edit IDs and finds only newly added assets", () => {
    assert.equal(assetIdFromEditUrl(newUrl), "new-asset");
    assert.deepEqual(newlyAddedEditAssets([oldUrl], [oldUrl, newUrl]).map((a) => a.id), ["new-asset"]);
  });

  it("requires one unambiguous x1 asset in the same project", () => {
    assert.equal(identifyNewEditAsset([oldUrl], [oldUrl, newUrl], oldUrl)?.id, "new-asset");
    assert.equal(
      identifyNewEditAsset([oldUrl], [oldUrl, newUrl, `${newUrl}-2`], oldUrl),
      null,
    );
    assert.equal(
      identifyNewEditAsset(
        [oldUrl],
        [oldUrl, "https://flow.google.com/project/other/edit/new-asset"],
        oldUrl,
      ),
      null,
    );
  });

  it("only accepts network media observed after the identified asset opened", () => {
    const identity = { assetId: "new-asset", openedAt: 1_000 };
    assert.equal(candidateMatchesAsset({ at: 999, url: newUrl }, identity), false);
    assert.equal(candidateMatchesAsset({ at: 1_001, url: newUrl }, identity), true);
    assert.equal(candidateMatchesAsset({ at: 1_001, url: oldUrl }, identity), false);
    assert.equal(candidateMatchesAsset({ at: 1_001, url: "https://cdn.example/video.mp4" }, identity), true);
  });

  it("requires a duration close to the requested tier", () => {
    assert.equal(minimumExpectedDurationMs(4), 3_000);
    assert.equal(minimumExpectedDurationMs(8), 6_500);
    assert.equal(minimumExpectedDurationMs(10), 8_500);
  });
});

it('retains rejected asset identity when its edit URL was never saved', async () => {
  const {checkpointAssetUrl} = await import('./asset-identity.mjs');
  assert.equal(checkpointAssetUrl({assetId:'old-take'},'https://flow.google.com/project/job-project'), 'https://flow.google.com/project/job-project/edit/old-take');
  assert.equal(checkpointAssetUrl({clipState:{assetId:'checkpoint-take'},projectUrl:'https://flow.google.com/project/job-project'}), 'https://flow.google.com/project/job-project/edit/checkpoint-take');
  assert.equal(checkpointAssetUrl({}), '');
});
