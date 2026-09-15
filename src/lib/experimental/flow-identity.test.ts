import { describe, expect, it } from "vitest";
import {
  displayAccountEmail,
  displayAccountLabel,
  extractSignedInAs,
  isAccountEmail,
  pickAccountEmail,
} from "./flow-identity";

describe("isAccountEmail", () => {
  it("accepts a real user address", () => {
    expect(isAccountEmail("zack@gmail.com")).toBe(true);
    expect(displayAccountEmail("  zack@gmail.com  ")).toBe("zack@gmail.com");
    expect(isAccountEmail("ada@hey.com")).toBe(true);
    expect(isAccountEmail("ada@acme.co")).toBe(true);
  });

  it("rejects every @google.com mailbox, including team inboxes", () => {
    expect(isAccountEmail("legal-notices@google.com")).toBe(false);
    expect(isAccountEmail("genieTTsupport@google.com")).toBe(false);
    expect(isAccountEmail("marketing-governance@google.com")).toBe(false);
    expect(isAccountEmail("support@google.com")).toBe(false);
    expect(isAccountEmail("cloudsupport@google.com")).toBe(false);
    expect(isAccountEmail("noreply@google.com")).toBe(false);
    expect(isAccountEmail("ada.lovelace@google.com")).toBe(false);
    expect(isAccountEmail("someone@corp.google.com")).toBe(false);
    expect(displayAccountEmail("marketing-governance@google.com")).toBeNull();
    expect(displayAccountEmail("legal-notices@google.com")).toBeNull();
  });

  it("rejects generic support/noreply local-parts on any domain", () => {
    expect(isAccountEmail("support@example.com")).toBe(false);
    expect(isAccountEmail("noreply@flow.app")).toBe(false);
    expect(isAccountEmail("noreply@labs.google")).toBe(false);
  });
});

describe("displayAccountLabel", () => {
  it("keeps a human label and hides leftover google.com identities", () => {
    expect(displayAccountLabel("Zack's Flow")).toBe("Zack's Flow");
    expect(displayAccountLabel("marketing-governance@google.com")).toBeNull();
    expect(displayAccountLabel("legal-notices@google.com")).toBeNull();
  });
});

describe("extractSignedInAs", () => {
  it("accepts picker copy on a consumer or workspace domain", () => {
    expect(extractSignedInAs("Signed in as zack@gmail.com")).toBe("zack@gmail.com");
    expect(extractSignedInAs("Google Account\nSigned in as: ada@hey.com")).toBe("ada@hey.com");
  });

  it("treats Signed in as *@google.com as unknown", () => {
    expect(extractSignedInAs("Signed in as marketing-governance@google.com")).toBeNull();
    expect(extractSignedInAs("Signed in as legal-notices@google.com")).toBeNull();
  });
});

describe("pickAccountEmail", () => {
  it("skips google.com chrome and prefers Gmail / consumer", () => {
    expect(pickAccountEmail("legal-notices@google.com genieTTsupport@google.com then zack@gmail.com")).toBe(
      "zack@gmail.com",
    );
    expect(pickAccountEmail("marketing-governance@google.com", "me@hey.com")).toBe("me@hey.com");
  });

  it("treats ListAccounts / chip of only @google.com as unknown", () => {
    expect(pickAccountEmail("marketing-governance@google.com legal-notices@google.com")).toBeNull();
    expect(pickAccountEmail("Contact legal-notices@google.com or genieTTsupport@google.com")).toBeNull();
    expect(displayAccountEmail(pickAccountEmail("support@google.com noreply@google.com"))).toBeNull();
    expect(displayAccountEmail("x22vetementschic1@gmail.com")).toBe("vetementschic1@gmail.com");
  });

  it("prefers Signed in as over other emails in the same blob", () => {
    expect(pickAccountEmail("legal-notices@google.com Signed in as zack@gmail.com footer")).toBe("zack@gmail.com");
  });
});
