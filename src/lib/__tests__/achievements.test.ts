import { describe, it, expect } from "vitest";
import { computeAchievements, weeklyAchievementFacts } from "../achievements";
import { addDays, dateRange, mondayOf } from "../dates";

describe("weeklyAchievementFacts（逐周扫描；lastFullWeekStart=2026-09-07 周一）", () => {
  const last = "2026-09-07";

  it("连续达标 3 周后断 1 周再 1 周 → bestGoalStreak=3；全勤周计数", () => {
    // w1/w2/w3 全 7 天（全勤+达标），w4 只 3 天（保底 6 未达标），w5 6 天（达标非全勤）
    const dates = [
      ...dateRange("2026-08-10", "2026-08-16"), // w1
      ...dateRange("2026-08-17", "2026-08-23"), // w2
      ...dateRange("2026-08-24", "2026-08-30"), // w3
      ...dateRange("2026-08-31", "2026-09-02"), // w4 前 3 天
      ...dateRange("2026-09-07", "2026-09-12"), // w5 周一~周六 6 天
    ].map(String);
    const f = weeklyAchievementFacts(dates, 6, undefined, last);
    expect(f.bestGoalStreak).toBe(3);
    expect(f.fullWeeks).toBe(3);
    expect(f.comeback).toBe(true); // w4 未达标、w5（最近完整周）达标
  });

  it("最近完整周未达标 → comeback=false", () => {
    const dates = [...dateRange("2026-08-31", "2026-09-05")]; // 最近周 0/6
    const f = weeklyAchievementFacts(dates, 6, undefined, last);
    expect(f.comeback).toBe(false);
  });

  it("注册第一周就达标（没有「上周」可对比）→ comeback=false", () => {
    // 注册 2026-09-01（周二），最近完整周 2026-08-31 整周在注册前不存在
    const dates = dateRange("2026-09-01", "2026-09-06");
    const f = weeklyAchievementFacts(dates, 6, "2026-09-01", last);
    expect(f.comeback).toBe(false);
    expect(f.bestGoalStreak).toBe(1);
    expect(f.fullWeeks).toBe(1); // 注册后 6 天全打满 = 全勤
  });

  it("注册周按剩余天数折算：注册周三+打 3 天（保底 6）→ 达标且全勤", () => {
    const dates = dateRange("2026-09-02", "2026-09-06"); // 周三~周日 5 天
    const f = weeklyAchievementFacts(dates, 6, "2026-09-02", last);
    expect(f.bestGoalStreak).toBe(1);
    expect(f.fullWeeks).toBe(1);
  });

  it("无注册信息时最多回看 52 周（防死循环）", () => {
    const dates: string[] = [];
    let ws = addDays(mondayOf(last), -7 * 100); // 100 周前起每周全打，共 101 周含最近周
    for (let i = 0; i < 101; i++) {
      dates.push(...dateRange(ws, addDays(ws, 6)));
      ws = addDays(ws, 7);
    }
    const f = weeklyAchievementFacts(dates, 7, undefined, last);
    expect(f.bestGoalStreak).toBe(52);
    expect(f.fullWeeks).toBe(52);
  });
});

describe("computeAchievements（成就墙）", () => {
  it("各维度按门槛解锁；恰好达线算解锁", () => {
    const a = computeAchievements({
      totalMinutes: 100 * 60,
      totalDays: 30,
      photoCount: 50,
      bestGoalStreak: 4,
      fullWeeks: 1,
      comeback: true,
    });
    const byKey = new Map(a.map((x) => [x.key, x.unlocked]));
    expect(byKey.get("h50")).toBe(true);
    expect(byKey.get("h100")).toBe(true);
    expect(byKey.get("h300")).toBe(false);
    expect(byKey.get("d30")).toBe(true);
    expect(byKey.get("d60")).toBe(false);
    expect(byKey.get("w4")).toBe(true);
    expect(byKey.get("w8")).toBe(false);
    expect(byKey.get("f1")).toBe(true);
    expect(byKey.get("f4")).toBe(false);
    expect(byKey.get("p50")).toBe(true);
    expect(byKey.get("cb")).toBe(true);
  });

  it("零数据 → 全部未解锁，共 14 枚", () => {
    const a = computeAchievements({
      totalMinutes: 0,
      totalDays: 0,
      photoCount: 0,
      bestGoalStreak: 0,
      fullWeeks: 0,
      comeback: false,
    });
    expect(a).toHaveLength(14);
    expect(a.every((x) => !x.unlocked)).toBe(true);
    expect(a.every((x) => x.title && x.detail)).toBe(true);
  });
});
