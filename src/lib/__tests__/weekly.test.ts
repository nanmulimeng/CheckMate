import { describe, it, expect } from "vitest";
import { addDays, dateRange } from "../dates";
import { computeWeekly, isFullAttendance, owedDays, weeklyBadges, weekProgress, weekStrip } from "../weekly";

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

describe("isFullAttendance（全勤 = 参与了且零缺卡）", () => {
  it("零应付（未参与）不算", () => {
    expect(isFullAttendance({ days: 0, missedDays: 0 })).toBe(false);
  });
  it("缺 1 天不算", () => {
    expect(isFullAttendance({ days: 6, missedDays: 1 })).toBe(false);
  });
  it("打满应付天数算", () => {
    expect(isFullAttendance({ days: 7, missedDays: 0 })).toBe(true);
    expect(isFullAttendance({ days: 4, missedDays: 0 })).toBe(true); // 注册周 4/4
  });
});

describe("weeklyBadges（weekStart=2026-08-31 周一；只和自己比：保底达标 / 全勤 / 连续达标 / 进步）", () => {
  type Row = { userId: number; date: string; durationMinutes: number; hasPhoto: boolean };
  // 打满 ws 那周 7 天
  const fill = (userId: number, ws: string): Row[] =>
    dateRange(ws, addDays(ws, 6)).map((d) => ({ userId, date: d, durationMinutes: 60, hasPhoto: true }));
  // 只打指定日期
  const pick = (userId: number, dates: string[]): Row[] =>
    dates.map((d) => ({ userId, date: d, durationMinutes: 60, hasPhoto: false }));

  it("本周全勤 → goalMet/full/streak=1；上周整周在注册前（周一注册）→ 上周不存在，improved=false", () => {
    const b = weeklyBadges(1, fill(1, "2026-08-31"), "2026-08-31", 6, "2026-08-31");
    expect(b).toEqual({ goalMet: true, full: true, streak: 1, improved: false });
  });

  it("保底 5、打 5 天 → 达标但非全勤", () => {
    const rows = pick(1, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    const b = weeklyBadges(1, rows, "2026-08-31", 5, "2026-08-01");
    expect(b.goalMet).toBe(true);
    expect(b.full).toBe(false);
    expect(b.streak).toBe(1);
  });

  it("保底 6、本周+上周都达标 → streak=2", () => {
    const rows = [...fill(1, "2026-08-24"), ...fill(1, "2026-08-31")];
    expect(weeklyBadges(1, rows, "2026-08-31", 6).streak).toBe(2);
  });

  it("保底 6、上周打 6 天（达标）、本周 7 天 → streak 连着算（保底制下 6 天即达标，不像全勤那样断）", () => {
    const rows = [...fill(1, "2026-08-24").slice(0, 6), ...fill(1, "2026-08-31")];
    const b = weeklyBadges(1, rows, "2026-08-31", 6);
    expect(b.streak).toBe(2);
    expect(b.improved).toBe(true); // 7 > 6
  });

  it("上周 4 天未达标、本周 6 天达标 → streak=1 重新起算", () => {
    const rows = [
      ...pick(1, ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"]),
      ...pick(1, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]),
    ];
    expect(weeklyBadges(1, rows, "2026-08-31", 6).streak).toBe(1);
  });

  it("注册周应付天数不足保底时按剩余天数折算：周四注册打满 4 天算达标，链止于注册周", () => {
    // 08-27（周四）注册，保底 6 但只欠 4 天 → 4/4 达标；本周全勤 → streak=2，不是 3
    const rows = [
      ...pick(1, ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]),
      ...fill(1, "2026-08-31"),
    ];
    const b = weeklyBadges(1, rows, "2026-08-31", 6, "2026-08-27");
    expect(b.streak).toBe(2);
  });

  it("本周 5 天 < 保底 6 → 未达标 streak=0；且上周不存在（本周二才注册）→ improved=false", () => {
    const rows = fill(1, "2026-08-31").slice(0, 5); // 09-01（周二）注册，打 5 天
    const b = weeklyBadges(1, rows, "2026-08-31", 6, "2026-09-01");
    expect(b).toEqual({ goalMet: false, full: false, streak: 0, improved: false });
  });

  it("improved：3→5 进步，5→5 持平不算", () => {
    const up = [
      ...pick(1, ["2026-08-24", "2026-08-25", "2026-08-26"]),
      ...pick(1, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]),
    ];
    expect(weeklyBadges(1, up, "2026-08-31", 6).improved).toBe(true);
    const flat = [
      ...pick(1, ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"]),
      ...pick(1, ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]),
    ];
    expect(weeklyBadges(1, flat, "2026-08-31", 6).improved).toBe(false);
  });

  it("rows 里混着别人的打卡不影响（按 userId 过滤）", () => {
    const rows = [...fill(2, "2026-08-31"), ...fill(1, "2026-08-31")];
    expect(weeklyBadges(1, rows, "2026-08-31", 6).full).toBe(true);
    expect(weeklyBadges(2, rows, "2026-08-31", 6).full).toBe(true);
  });

  it("零打卡成员 → 全 false/0", () => {
    const b = weeklyBadges(9, fill(1, "2026-08-31"), "2026-08-31", 6, "2026-08-01");
    expect(b).toEqual({ goalMet: false, full: false, streak: 0, improved: false });
  });

  it("streak 封顶 52 周（无注册信息的老用户防死循环）", () => {
    const many: Row[] = [];
    let ws = "2026-08-31";
    for (let i = 0; i < 60; i++) {
      many.push(...fill(1, ws));
      ws = addDays(ws, -7);
    }
    expect(weeklyBadges(1, many, "2026-08-31", 6).streak).toBe(52);
  });
});

describe("weekProgress（首页本周保底进度条；weekStart=2026-09-07 周一）", () => {
  it("周四 4/6：格子状态正确，文案「再打 2 天达到本周保底」", () => {
    const p = weekProgress("2026-09-07", "2026-09-10", 6, [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
    expect(p.days).toBe(4);
    expect(p.remaining).toBe(2);
    expect(p.text).toBe("再打 2 天达到本周保底");
    expect(p.cells).toHaveLength(7);
    expect(p.cells[0]).toMatchObject({ date: "2026-09-07", label: "一", checked: true, state: "past" });
    expect(p.cells[3]).toMatchObject({ date: "2026-09-10", checked: true, state: "today" });
    expect(p.cells[4]).toMatchObject({ date: "2026-09-11", checked: false, state: "future" });
    expect(p.cells[6].label).toBe("日");
  });

  it("同日多条打卡只算一天；日期集合里混入本周之外的日期不计", () => {
    const p = weekProgress("2026-09-07", "2026-09-10", 6, [
      "2026-09-07",
      "2026-09-07",
      "2026-09-06", // 上周日
      "2026-09-14", // 下周一
    ]);
    expect(p.days).toBe(1);
    expect(p.cells[0].checked).toBe(true);
  });

  it("达到保底：文案「已达到本周保底」", () => {
    const p = weekProgress("2026-09-07", "2026-09-10", 4, ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]);
    expect(p.remaining).toBe(0);
    expect(p.text).toBe("已达到本周保底");
  });

  it("周日未达标：文案带截止时刻（deadlineHour 默认 1 → 明天 01:00）", () => {
    const p = weekProgress("2026-09-07", "2026-09-13", 6, ["2026-09-07", "2026-09-08"]);
    expect(p.text).toBe("本周最后一天 · 截止明天 01:00 前打卡还算数");
  });

  it("周日未达标且 deadlineHour=22：文案随配置变化", () => {
    const p = weekProgress("2026-09-07", "2026-09-13", 6, [], 22);
    expect(p.text).toBe("本周最后一天 · 截止明天 22:00 前打卡还算数");
  });

  it("周日已达标：仍显示「已达到本周保底」而非最后一天提醒", () => {
    const p = weekProgress("2026-09-07", "2026-09-13", 6, dateRange("2026-09-07", "2026-09-12"));
    expect(p.text).toBe("已达到本周保底");
  });
});

describe("weekStrip（周结算成员行的 7 格周条；weekStart=2026-09-07 周一）", () => {
  it("打卡/照片/超额区都按天标注；同日多条只要一条带照片就算有凭证", () => {
    const cells = weekStrip("2026-09-07", 6, [
      { date: "2026-09-07", hasPhoto: false },
      { date: "2026-09-07", hasPhoto: true }, // 同日第二条带照片
      { date: "2026-09-09", hasPhoto: false },
      { date: "2026-09-13", hasPhoto: false }, // 周日（第 7 格，超额区）
      { date: "2026-09-06", hasPhoto: false }, // 上周日，窗口外不计
    ]);
    expect(cells).toHaveLength(7);
    expect(cells[0]).toMatchObject({ label: "一", checked: true, hasPhoto: true, beyondGoal: false });
    expect(cells[1]).toMatchObject({ label: "二", checked: false, beyondGoal: false });
    expect(cells[2]).toMatchObject({ label: "三", checked: true, hasPhoto: false });
    expect(cells[6]).toMatchObject({ label: "日", checked: true, hasPhoto: false, beyondGoal: true });
  });

  it("保底 7 天时没有超额区", () => {
    const cells = weekStrip("2026-09-07", 7, []);
    expect(cells.every((c) => !c.beyondGoal)).toBe(true);
  });

  it("零打卡 → 全 unchecked", () => {
    const cells = weekStrip("2026-09-07", 6, []);
    expect(cells.every((c) => !c.checked)).toBe(true);
    expect(cells.filter((c) => c.beyondGoal)).toHaveLength(1);
  });
});
