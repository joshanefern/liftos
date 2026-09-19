import { describe, expect, it } from "vitest";
import { chooseTranscript, longerOf } from "./voiceTranscript";

describe("chooseTranscript — the iPhone truncated-final cases", () => {
  it("a 2-char final never beats a 35-char partial (the real failure)", () => {
    expect(chooseTranscript("So", "I did three sets of squats at 135")).toBe(
      "I did three sets of squats at 135",
    );
  });
  it("an empty final never beats what was heard", () => {
    expect(chooseTranscript("", "three sets of squats")).toBe("three sets of squats");
  });
  it("a refinement that shortens the text a little still wins", () => {
    expect(chooseTranscript("3 sets of squats", "three sets of squats")).toBe("3 sets of squats");
  });
  it("a longer final wins outright", () => {
    expect(chooseTranscript("three sets of squats at 135", "three sets of squats")).toBe(
      "three sets of squats at 135",
    );
  });
  it("both empty → empty (nothing was heard)", () => {
    expect(chooseTranscript("", "")).toBe("");
  });
  it("exactly half is accepted as a refinement", () => {
    expect(chooseTranscript("12345", "1234567890")).toBe("12345");
    expect(chooseTranscript("1234", "1234567890")).toBe("1234567890");
  });
});

describe("longerOf", () => {
  it("keeps the longest partial across a session", () => {
    let longest = "";
    for (const p of ["I", "I did", "I did three", "I did three sets", "I did", "So"]) {
      longest = longerOf(p, longest);
    }
    expect(longest).toBe("I did three sets");
  });
});
