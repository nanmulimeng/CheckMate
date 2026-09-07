import { describe, it, expect } from "vitest";
import { crossedMilestones, milestoneHistory, nextMilestone } from "../milestones";

describe("crossedMilestones（全组合力里程碑：档位 100/300/600/1000 小时）", () => {
  it("恰好跨过 100 小时 → [100]", () => {
    expect(crossedMilestones(99 * 60, 100 * 60)).toEqual([100]);
  });

  it("一次打卡跨两档 → [100, 300]", () => {
    expect(crossedMilestones(280 * 60, 350 * 60)).toEqual([300]);
    expect(crossedMilestones(90 * 60, 310 * 60)).toEqual([100, 300]);
  });

  it("没到档 / 已在档上继续 → []", () => {
    expect(crossedMilestones(0, 50 * 60)).toEqual([]);
    expect(crossedMilestones(100 * 60, 200 * 60)).toEqual([]);
  });

  it("before/after 恰在档边界：before=档、after>档 不算跨（档上的是历史）", () => {
    expect(crossedMilestones(100 * 60, 100 * 60 + 1)).toEqual([]);
    expect(crossedMilestones(299 * 60 + 59, 301 * 60)).toEqual([300]);
  });
});

describe("milestoneHistory（按打卡先后累加，回推每档解锁时刻）", () => {
  const t = (s: string) => new Date(s);

  it("乱序输入按 createdAt 排序累加；跨档记录该条的 createdAt", () => {
    const rows = [
      { durationMinutes: 6 * 60, createdAt: t("2026-08-03T10:00:00Z") },
      { durationMinutes: 95 * 60, createdAt: t("2026-08-02T10:00:00Z") },
      { durationMinutes: 100 * 60, createdAt: t("2026-08-10T10:00:00Z") },
    ];
    const hist = milestoneHistory(rows);
    expect([...hist.keys()]).toEqual([100]);
    expect(hist.get(100)?.toISOString()).toBe("2026-08-03T10:00:00.000Z");
  });

  it("全部时长加起来都不够第一档 → 空 Map", () => {
    const hist = milestoneHistory([{ durationMinutes: 99 * 60, createdAt: t("2026-08-02T10:00:00Z") }]);
    expect([...hist]).toEqual([]);
  });
});

describe("nextMilestone（下一档与进度）", () => {
  it("累计 234.5 小时 → 下一档 300，区间进度 (234.5-100)/(300-100)≈0.67", () => {
    const n = nextMilestone(234.5 * 60);
    expect(n.hours).toBe(300);
    expect(n.ratio).toBeGreaterThan(0.67);
    expect(n.ratio).toBeLessThan(0.68);
    expect(n.remainingHours).toBe(65.5);
  });

  it("累计 0 → 下一档 100，进度 0", () => {
    const n = nextMilestone(0);
    expect(n).toMatchObject({ hours: 100, ratio: 0, remainingHours: 100 });
  });

  it("超过最后一档 → hours null（已全部解锁）", () => {
    expect(nextMilestone(1001 * 60).hours).toBeNull();
  });

  it("恰在档上 → 下一档是更大的一档", () => {
    expect(nextMilestone(100 * 60).hours).toBe(300);
  });
});
