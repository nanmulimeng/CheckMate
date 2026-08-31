import { describe, it, expect } from "vitest";
import { computeWeekly, owedDays } from "../weekly";

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

describe("缺卡只算注册之后（新用户不背注册前的欠账）", () => {
  // 2026-08-24（周一）那周；丙 2026-08-27（周四）注册，当天打了卡
  const rows = [{ userId: 3, displayName: "丙", date: "2026-08-27", durationMinutes: 60, hasPhoto: true }];

  it("owedDays：周前注册=7、周中注册=剩余天数、周末后=0、未提供=7", () => {
    expect(owedDays("2026-08-24", "2026-08-01")).toBe(7); // 周前
    expect(owedDays("2026-08-24", "2026-08-27")).toBe(4); // 周四起：27/28/29/30
    expect(owedDays("2026-08-24", "2026-09-02")).toBe(0); // 下周三
    expect(owedDays("2026-08-24", undefined)).toBe(7); // 老用户无记录
  });

  it("周四注册当天打卡 → 缺卡 3 天（而非 6 天）", () => {
    const [stat] = computeWeekly(rows, "2026-08-24", new Map([[3, "2026-08-27"]]));
    expect(stat.days).toBe(1);
    expect(stat.missedDays).toBe(3);
  });

  it("不传 registeredOnByUser 时保持旧口径（全周 7 天应打）", () => {
    const [stat] = computeWeekly(rows, "2026-08-24");
    expect(stat.missedDays).toBe(6);
  });
});
