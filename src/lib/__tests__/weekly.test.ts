import { describe, it, expect } from "vitest";
import { computeWeekly } from "../weekly";

const rows = [
  { userId: 1, displayName: "甲", date: "2026-08-24", durationMinutes: 120, hasPhoto: true },
  { userId: 1, displayName: "甲", date: "2026-08-25", durationMinutes: 60, hasPhoto: false },
  { userId: 2, displayName: "乙", date: "2026-08-24", durationMinutes: 200, hasPhoto: true },
];

describe("computeWeekly（weekStart=周一 2026-08-24）", () => {
  const stats = computeWeekly(rows, "2026-08-24");
  it("甲：2天 180分钟 无凭证1天", () => {
    const a = stats.find((s) => s.userId === 1)!;
    expect(a.days).toBe(2);
    expect(a.totalMinutes).toBe(180);
    expect(a.noProofDays).toBe(1);
  });
  it("乙：缺卡6天", () => {
    const b = stats.find((s) => s.userId === 2)!;
    expect(b.missedDays).toBe(6);
  });
  it("区间外数据不计入", () => {
    expect(computeWeekly([...rows, { userId: 1, displayName: "甲", date: "2026-08-31", durationMinutes: 99, hasPhoto: true }], "2026-08-24").find((s) => s.userId === 1)!.days).toBe(2);
  });
});
