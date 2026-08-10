import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteConversation,
  listConversations,
  relativeStamp,
  saveConversation,
  titleFor,
} from "./coachStore";

describe("titleFor", () => {
  it("uses the first user message as the title", () => {
    expect(
      titleFor([
        { role: "user", content: "Why Pull Day today?" },
        { role: "assistant", content: "Because lats." },
      ]),
    ).toBe("Why Pull Day today?");
  });

  it("collapses whitespace and truncates long prompts with an ellipsis", () => {
    const long = "Build me a full   week of training\nwith progression on every single lift please";
    const title = titleFor([{ role: "user", content: long }]);
    expect(title.length).toBeLessThanOrEqual(43);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toContain("\n");
  });

  it("falls back for conversations with no user message", () => {
    expect(titleFor([])).toBe("New chat");
  });
});

describe("conversation store", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists newest-first, and updates in place", () => {
    saveConversation("a", [{ role: "user", content: "first chat" }]);
    saveConversation("b", [{ role: "user", content: "second chat" }]);
    saveConversation("a", [
      { role: "user", content: "first chat" },
      { role: "assistant", content: "reply" },
    ]);
    const list = listConversations();
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list[0].messages).toHaveLength(2);
  });

  it("never stores empty conversations", () => {
    saveConversation("empty", []);
    expect(listConversations()).toHaveLength(0);
  });

  it("deletes by id", () => {
    saveConversation("a", [{ role: "user", content: "hi" }]);
    deleteConversation("a");
    expect(listConversations()).toHaveLength(0);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("liftos-coach-conversations", "{not json");
    expect(listConversations()).toEqual([]);
  });
});

describe("relativeStamp", () => {
  const now = Date.parse("2026-08-10T12:00:00Z");
  it("formats minutes, hours, days, weeks", () => {
    expect(relativeStamp("2026-08-10T11:59:40Z", now)).toBe("just now");
    expect(relativeStamp("2026-08-10T11:30:00Z", now)).toBe("30m ago");
    expect(relativeStamp("2026-08-10T07:00:00Z", now)).toBe("5h ago");
    expect(relativeStamp("2026-08-07T12:00:00Z", now)).toBe("3d ago");
    expect(relativeStamp("2026-07-20T12:00:00Z", now)).toBe("3w ago");
  });
});
