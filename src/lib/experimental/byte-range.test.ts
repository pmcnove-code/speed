import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
  it("parses open-ended and suffix ranges for mp4 playback", () => {
    expect(parseByteRange("bytes=0-1023", 5000)).toEqual({ start: 0, end: 1023 });
    expect(parseByteRange("bytes=1000-", 5000)).toEqual({ start: 1000, end: 4999 });
    expect(parseByteRange("bytes=-200", 5000)).toEqual({ start: 4800, end: 4999 });
    expect(parseByteRange(null, 5000)).toBeNull();
    expect(parseByteRange("bytes=9000-", 5000)).toBeNull();
  });
});
