import { describe, expect, it } from "vitest";
import { flowDispatchInputHash, flowIdempotencyKey } from "./reel-dispatch";

describe("Flow dispatch identity", () => {
  it("is stable across object key order and changes with sacred copy", () => {
    const first = flowDispatchInputHash({
      script: "Sacred copy.",
      clips: [{ id: "C01", spoken: "Sacred copy." }],
    });
    const reordered = flowDispatchInputHash({
      clips: [{ spoken: "Sacred copy.", id: "C01" }],
      script: "Sacred copy.",
    });
    const changed = flowDispatchInputHash({
      script: "Changed copy.",
      clips: [{ id: "C01", spoken: "Changed copy." }],
    });
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(flowIdempotencyKey(7, first)).toBe(`reel:7:${first}`);
  });

  it("changes when the reel identity changes so POST /jobs cannot collide", () => {
    const a = flowDispatchInputHash({ reelJobId: 1, script: "A" });
    const b = flowDispatchInputHash({ reelJobId: 2, script: "A" });
    expect(a).not.toBe(b);
    expect(flowIdempotencyKey(1, a)).not.toBe(flowIdempotencyKey(2, a));
  });
});
