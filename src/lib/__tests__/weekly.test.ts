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

describe("computeWeekly 无凭证口径（与热力图一致：任一条有照片即有凭证）", () => {
  it("同一天一条带照片一条不带 → 不算无凭证天", () => {
    const mixed = [
      { userId: 1, displayName: "A", date: "2026-08-24", durationMinutes: 60, hasPhoto: false },
      { userId: 1, displayName: "A", date: "2026-08-24", durationMinutes: 30, hasPhoto: true },
      { userId: 1, displayName: "A", date: "2026-08-25", durationMinutes: 60, hasPhoto: false },
    ];
    const [stat] = computeWeekly(mixed, "2026-08-24");
    expect(stat.days).toBe(2);
    expect(stat.noProofDays).toBe(1); // 24 日有一条带照片不算，25 日整天无照片才算
    expect(stat.missedDays).toBe(5);
  });

  it("整天全部无照片才计无凭证天", () => {
    const none = [
      { userId: 1, displayName: "A", date: "2026-08-24", durationMinutes: 60, hasPhoto: false },
      { userId: 1, displayName: "A", date: "2026-08-24", durationMinutes: 30, hasPhoto: false },
    ];
    const [stat] = computeWeekly(none, "2026-08-24");
    expect(stat.noProofDays).toBe(1);
  });
});
