import { describe, expect, it } from "vitest";
import { reelProgress } from "./reel-progress";

describe("reel progress", () => {
  it("explains missing submitted output without telling users to discard saved clips", () => {
    expect(reelProgress({status:"error",stage:"clips",error:"Flow: C03 was submitted but its video is still unavailable after the shared 10-minute observation window."}).message).toContain("saved clips are preserved");
  });
  it("distinguishes saved clips from a finished video", () => {
    expect(reelProgress({status:"done",stage:"clips"}).message).toBe("Your clips are ready — edit and stitch to make your video");
    expect(reelProgress({status:"done",stage:"stitch"}).message).toBe("Your video is ready");
  });
  it("explains reload recovery instead of a vague repeated check", () => {
    const result = reelProgress({status:"running", stage:"clips", stageDetail:"Flow: [clip] C01/C05\nFlow: [recover] C01 reloading the video service to recover the submitted clip (1/2) — no new generation"});
    expect(result.message).toBe("Reloading the video service to recover clip 1 of 5");
  });
  it("explains how to resolve the persisted Reel 82 missing-character error", () => {
    const progress = reelProgress({ status: "error", stage: "clips", error: "All Flow accounts failed. magic: Flow: C01 character ingredient did not attach (no Latino Dad or Copy Studio in this Flow library). Generation was not started." });
    expect(progress.message).toContain("reference photo in Personas");
    expect(progress.failed).toBe(true);
  });
  it("reports clip progress in plain language without showing diagnostic logs", () => {
    const progress = reelProgress({ status: "running", stage: "clips", stageDetail: "Flow: [clip] C02/C03 continuing discussion\nFlow: [script] C02 checking speech against copy" });
    expect(progress.message).toBe("Checking clip 2 of 3");
    expect(progress.percent).toBeGreaterThan(40);
    expect(progress.percent).toBeLessThan(85);
  });
  it("distinguishes queued, completed and failed jobs", () => {
    expect(reelProgress({ status: "queued", stage: "clips" }).percent).toBe(0);
    expect(reelProgress({ status: "done", stage: "stitch" }).percent).toBe(100);
    const error = reelProgress({ status: "error", stage: "clips", error: "FLOW_BLOCKED: unusual activity" });
    expect(error.failed).toBe(true);
    expect(error.message).not.toContain("FLOW_BLOCKED");
    expect(error.message).toContain("try again later");
  });
});

it('shows individual clip editing before assembly',()=>{
 const progress=reelProgress({status:'running',stage:'clips',stageDetail:'Flow: [clip-edit] C02/5 editing source clip with CapCut'});
 expect(progress.message).toBe('Editing clip 2 of 5 before assembly');
 expect(progress.percent).toBe(87);
});
