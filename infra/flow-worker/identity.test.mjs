import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayAccountEmail,
  displayAccountLabel,
  emailFromStorageState,
  extractEmail,
  extractSignedInAs,
  isAccountEmail,
  pickAccountEmail,
} from "./identity.mjs";

describe("extractEmail", () => {
  it("skips Google product / support addresses and takes the real one", () => {
    const page = "Privacy legal-notices@google.com Contact genieTTsupport@google.com Then zack@gmail.com credits";
    assert.equal(extractEmail(page), "zack@gmail.com");
    assert.equal(extractEmail("Help legal-notices@google.com footer"), null);
    assert.equal(extractEmail("Connected as genieTTsupport@google.com"), null);
    assert.equal(extractEmail("Signed in as marketing-governance@google.com"), null);
  });

  it("rejects every @google.com mailbox", () => {
    assert.equal(isAccountEmail("noreply@foo.com"), false);
    assert.equal(isAccountEmail("support@example.com"), false);
    assert.equal(isAccountEmail("genieTTsupport@google.com"), false);
    assert.equal(isAccountEmail("marketing-governance@google.com"), false);
    assert.equal(isAccountEmail("cloudsupport@google.com"), false);
    assert.equal(isAccountEmail("mail-noreply@google.com"), false);
    assert.equal(isAccountEmail("ada.lovelace@google.com"), false);
    assert.equal(isAccountEmail("zack.m@outlook.com"), true);
    assert.equal(isAccountEmail("ada@hey.com"), true);
  });
});

describe("extractSignedInAs", () => {
  it("reads picker copy and rejects google.com", () => {
    assert.equal(extractSignedInAs("Signed in as zack@gmail.com"), "zack@gmail.com");
    assert.equal(extractSignedInAs("Signed in as marketing-governance@google.com"), null);
  });
});

describe("displayAccountLabel", () => {
  it("hides leftover google.com labels", () => {
    assert.equal(displayAccountLabel("Zack's Flow"), "Zack's Flow");
    assert.equal(displayAccountLabel("marketing-governance@google.com"), null);
  });
});

describe("emailFromStorageState", () => {
  it("reads an email from localStorage without using token-looking first hits", () => {
    const email = emailFromStorageState({
      cookies: [{ name: "SID", value: "not-an-email-token" }],
      origins: [
        {
          origin: "https://labs.google",
          localStorage: [{ name: "profile", value: JSON.stringify({ email: "real.user@gmail.com" }) }],
        },
      ],
    });
    assert.equal(email, "real.user@gmail.com");
  });

  it("never persists legal-notices, marketing-governance, or other @google.com from cookie blobs", () => {
    assert.equal(
      emailFromStorageState({
        cookies: [{ name: "footer", value: "legal-notices@google.com marketing-governance@google.com" }],
        origins: [],
      }),
      null,
    );
  });
});

describe("pickAccountEmail", () => {
  it("prefers Gmail / consumer over leftover @google.com", () => {
    assert.equal(pickAccountEmail("legal-notices@google.com", ["support@google.com", "me@hey.com"]), "me@hey.com");
    assert.equal(pickAccountEmail("marketing-governance@google.com ada@gmail.com"), "ada@gmail.com");
  });

  it("returns unknown when only Google mailboxes are present", () => {
    assert.equal(pickAccountEmail("legal-notices@google.com marketing-governance@google.com"), null);
    assert.equal(displayAccountEmail("genieTTsupport@google.com"), null);
    assert.equal(displayAccountEmail("x22vetementschic1@gmail.com"), "vetementschic1@gmail.com");
  });
});
