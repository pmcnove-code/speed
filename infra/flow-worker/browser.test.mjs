import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium as baseChromium } from "playwright";
import { createChromium, stealthEnabled } from "./browser.mjs";

describe("Flow browser configuration", () => {
  it("enables stealth by default with an explicit rollback switch", () => {
    assert.equal(stealthEnabled("1"), true);
    assert.equal(stealthEnabled("true"), true);
    for (const value of ["0", "false", "off", " OFF "]) {
      assert.equal(stealthEnabled(value), false);
    }
  });

  it("registers the real stealth plugin on an isolated Playwright adapter", () => {
    const a = createChromium({ stealth: true });
    const b = createChromium({ stealth: true });
    assert.notEqual(a, b);
    assert.deepEqual(a.plugins.list.map((plugin) => plugin.name), ["stealth"]);
    assert.equal(createChromium({ stealth: false }), baseChromium);
  });
});
