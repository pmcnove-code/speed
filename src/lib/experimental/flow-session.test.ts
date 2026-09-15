import { describe, expect, it } from "vitest";
import { parseStorageState } from "./flow-session";

describe("parseStorageState", () => {
  it("accepts Playwright storageState", () => {
    const got = parseStorageState({
      cookies: [{ name: "SID", value: "x", domain: ".google.com", path: "/" }],
      origins: [],
    });
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.state.cookies[0]?.name).toBe("SID");
  });

  it("wraps a cookie-export array", () => {
    const got = parseStorageState([{ name: "SID", value: "x", domain: ".google.com" }]);
    expect(got.ok).toBe(true);
  });

  it("rejects empty or junk", () => {
    expect(parseStorageState("{}").ok).toBe(false);
    expect(parseStorageState("not-json").ok).toBe(false);
    expect(parseStorageState({ cookies: [] }).ok).toBe(false);
  });
});
