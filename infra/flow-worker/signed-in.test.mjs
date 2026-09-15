import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFlowAppUrl, isFlowProjectUrl, isGoogleLoginUrl, looksFlowBlocked, looksLoggedInToFlow, looksSignedOut } from "./signed-in.mjs";

describe("isFlowAppUrl", () => {
  it("accepts Flow app hosts only", () => {
    assert.equal(isFlowAppUrl("https://labs.google/fx/tools/flow"), true);
    assert.equal(isFlowAppUrl("https://labs.google/fx/tools/flow?tab=projects"), true);
    assert.equal(isFlowAppUrl("https://flow.google/"), true);
    assert.equal(isFlowAppUrl("https://accounts.google.com/v3/signin/challenge"), false);
    assert.equal(isFlowAppUrl("https://www.google.com/"), false);
  });

  it("rejects the public /about marketing page even though it is on the flow.google.com host", () => {
    assert.equal(isFlowAppUrl("https://flow.google.com/about"), false);
    assert.equal(isFlowAppUrl("https://flow.google.com/about?ref=nav"), false);
  });
});

describe("isFlowProjectUrl", () => {
  it("detects project pages only", () => {
    assert.equal(isFlowProjectUrl("https://flow.google.com/project/abc"), true);
    assert.equal(isFlowProjectUrl("https://flow.google.com/"), false);
    assert.equal(isFlowProjectUrl("https://labs.google/fx/tools/flow"), false);
  });
});

describe("isGoogleLoginUrl", () => {
  it("detects identifier and challenge, ignores leftover GIS iframes", () => {
    assert.equal(isGoogleLoginUrl("https://accounts.google.com/v3/signin/identifier"), true);
    assert.equal(isGoogleLoginUrl("https://accounts.google.com/v3/signin/challenge/pwd"), true);
    assert.equal(isGoogleLoginUrl("https://accounts.google.com/gsi/iframe"), false);
    assert.equal(isGoogleLoginUrl("https://labs.google/fx/tools/flow"), false);
  });
});

describe("looksFlowBlocked", () => {
  it("detects Google unusual-activity failures", () => {
    assert.equal(
      looksFlowBlocked(
        "Failed\nWe noticed some unusual activity. Please visit the Help Centre for more information.\nYou have not been charged for this generation.",
      ),
      true,
    );
    assert.equal(looksFlowBlocked("C02 rendering 25%"), false);
    assert.equal(looksFlowBlocked("Failed. You have not been charged for this generation."), false);
  });
});

describe("looksSignedOut", () => {
  it("treats Google login flashes as signed out", () => {
    assert.equal(looksSignedOut("https://accounts.google.com/signin/v2/identifier", "Sign in"), true);
    assert.equal(
      looksSignedOut("https://labs.google/fx/tools/flow", "Sign in to continue Use your Google Account Sign in"),
      true,
    );
  });
});

describe("looksLoggedInToFlow", () => {
  it("does not treat a Flow landing page, footer email, or google.com as signed in", () => {
    assert.equal(
      looksLoggedInToFlow("https://labs.google/fx/tools/flow", "Sign in  Contact legal-notices@google.com"),
      false,
    );
    assert.equal(
      looksLoggedInToFlow("https://accounts.google.com/", "zack@gmail.com New project"),
      false,
    );
    assert.equal(looksLoggedInToFlow("https://www.google.com/", "New project"), false);
    assert.equal(
      looksLoggedInToFlow("https://labs.google/fx/tools/flow", "Text to video Image to video Sign in with Google Email or phone"),
      false,
    );
    assert.equal(
      looksLoggedInToFlow(
        "https://labs.google/fx/tools/flow",
        "Sign in\nto continue to AI Test Kitchen\nEmail or phone\nText to video\nIngredients",
      ),
      false,
    );
    assert.equal(
      // Regression: Flow's own /about pricing page lists "Ingredients to
      // Video" as a plan feature, which must not be mistaken for the
      // signed-in app's Ingredients panel.
      looksLoggedInToFlow(
        "https://flow.google.com/about",
        "Google Flow Tools (Usage only) Agent Text to Video Frames to Video Ingredients to Video Video Extension",
      ),
      false,
    );
  });

  it("requires Flow URL plus project UI", () => {
    assert.equal(
      looksLoggedInToFlow("https://labs.google/fx/tools/flow", "Projects  New project  Ingredients"),
      true,
    );
    assert.equal(
      looksLoggedInToFlow("https://flow.google/", "Your projects  New project  Enter a prompt"),
      true,
    );
    assert.equal(
      looksLoggedInToFlow(
        "https://labs.google/fx/tools/flow",
        "All media Characters Start creating or drop media What do you want to create? Video · 720p · 8s Agent",
      ),
      true,
    );
  });
});
