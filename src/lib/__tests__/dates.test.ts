import { describe, it, expect } from "vitest";
import {
  beijingDateStr, deadlineOf, canCheckInFor,
  defaultCheckInDate, addDays, lastMonday, mondayOf, dateRange,
} from "../dates";

// 北京 = UTC+8 恒定（无夏令时）。UTC 时刻 X 的北京时刻 = X+8h。
describe("beijingDateStr", () => {
  it("UTC 15:59 是北京当天 23:59 → 当天日期", () => {
    expect(beijingDateStr(new Date("2026-12-01T15:59:00Z"))).toBe("2026-12-01");
  });
  it("UTC 17:00 是北京次日 01:00 → 次日日期", () => {
    expect(beijingDateStr(new Date("2026-12-01T17:00:00Z"))).toBe("2026-12-02");
  });
});

describe("deadlineOf", () => {
  it("12-01 的截止 = 12-02 北京 01:00 = UTC 12-01 17:00", () => {
    expect(deadlineOf("2026-12-01").getTime()).toBe(Date.UTC(2026, 11, 1, 17, 0, 0));
  });
  it("可配小时：10 → 次日北京 10:00 = UTC 次日 02:00（跨日进位）", () => {
    expect(deadlineOf("2026-12-01", 10).getTime()).toBe(Date.UTC(2026, 11, 2, 2, 0, 0));
  });
  it("可配小时：0 → 当天北京 24:00 = UTC 当天 16:00", () => {
    expect(deadlineOf("2026-12-01", 0).getTime()).toBe(Date.UTC(2026, 11, 1, 16, 0, 0));
  });
});

describe("canCheckInFor", () => {
  it("截止前可以", () => {
    expect(canCheckInFor("2026-12-01", new Date("2026-12-01T10:00:00Z"))).toBe(true);
  });
  it("截止时刻之后不可以", () => {
    expect(canCheckInFor("2026-12-01", new Date("2026-12-01T17:00:01Z"))).toBe(false);
  });
  it("未来日期不可以（防穿越）", () => {
    expect(canCheckInFor("2026-12-05", new Date("2026-12-01T10:00:00Z"))).toBe(false);
  });
  it("可配小时：默认已锁但配成 10 后仍在窗口内", () => {
    const now = new Date("2026-12-01T18:00:00Z"); // 北京 12-02 02:00
    expect(canCheckInFor("2026-12-01", now)).toBe(false);
    expect(canCheckInFor("2026-12-01", now, 10)).toBe(true);
  });
});

describe("defaultCheckInDate（凌晨归属）", () => {
  it("北京 00:30 → 默认昨天", () => {
    expect(defaultCheckInDate(new Date("2026-11-30T16:30:00Z"))).toBe("2026-11-30");
  });
  it("北京 01:30 → 今天", () => {
    expect(defaultCheckInDate(new Date("2026-11-30T17:30:00Z"))).toBe("2026-12-01");
  });
  it("北京 14:00 → 今天", () => {
    expect(defaultCheckInDate(new Date("2026-12-01T06:00:00Z"))).toBe("2026-12-01");
  });
  it("可配小时：北京 02:00 配截止 5 → 仍默认昨天（默认 1 则记今天）", () => {
    expect(defaultCheckInDate(new Date("2026-12-01T18:00:00Z"), 5)).toBe("2026-12-01"); // 北京 12-02
    expect(defaultCheckInDate(new Date("2026-12-01T18:00:00Z"))).toBe("2026-12-02");
  });
});

describe("周与区间", () => {
  it("2026-08-31(周一)的 lastMonday = 2026-08-24", () => {
    expect(lastMonday(new Date("2026-08-31T04:00:00Z"))).toBe("2026-08-24");
  });
  it("mondayOf：周一返回自身，周日回到 6 天前", () => {
    expect(mondayOf("2026-08-31")).toBe("2026-08-31"); // 周一
    expect(mondayOf("2026-09-03")).toBe("2026-08-31"); // 周四
    expect(mondayOf("2026-09-06")).toBe("2026-08-31"); // 周日
  });
  it("dateRange 闭区间", () => {
    expect(dateRange("2026-08-24", "2026-08-26")).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
  });
  it("addDays 跨月", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});
