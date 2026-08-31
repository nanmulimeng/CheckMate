import { describe, it, expect } from "vitest";
import { computeStreak } from "../streak";

describe("computeStreak", () => {
  it("连续三天", () => {
    expect(computeStreak(["2026-12-01", "2026-11-30", "2026-11-29"], "2026-12-01")).toBe(3);
  });
  it("中间断一天只算最近的", () => {
    expect(computeStreak(["2026-12-01", "2026-11-28"], "2026-12-01")).toBe(1);
  });
  it("今天缺但昨天有 → 昨天 streak（今天未截止，不断）", () => {
    expect(computeStreak(["2026-11-30", "2026-11-29"], "2026-12-01")).toBe(2);
  });
  it("完全没打过 → 0", () => {
    expect(computeStreak([], "2026-12-01")).toBe(0);
  });
  it("同一日期多条记录不重复计数", () => {
    expect(computeStreak(["2026-12-01", "2026-12-01"], "2026-12-01")).toBe(1);
  });
});
