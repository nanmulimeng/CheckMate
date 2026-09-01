import { describe, it, expect } from "vitest";
import {
  HEATMAP_WEEKS,
  buildHeatRecords,
  buildSubjectBars,
  heatLevel,
  heatmapWindow,
} from "../me-stats";

// 2026-08-31 是周一：本周 = 2026-03-09（周一）起的第 26 列
const TODAY = "2026-08-31";
const WIN_START = "2026-03-09";
const WIN_END = "2026-09-06"; // 本周日，含今天之后的未来天

describe("heatmapWindow", () => {
  it("26 周按周对齐：本周一往前推 25 周为起点，终点是本周日", () => {
    expect(heatmapWindow(TODAY)).toEqual({ start: WIN_START, end: WIN_END });
    expect(HEATMAP_WEEKS).toBe(26);
  });

  it("周中与周日锚定同一张网格（对齐到所在周）", () => {
    expect(heatmapWindow("2026-09-03")).toEqual({ start: WIN_START, end: WIN_END }); // 周四
    expect(heatmapWindow("2026-09-06")).toEqual({ start: WIN_START, end: WIN_END }); // 周日
    // 下一周的周一同属下一张网格
    expect(heatmapWindow("2026-09-07")).toEqual({ start: "2026-03-16", end: "2026-09-13" });
  });
});

describe("heatLevel", () => {
  it("四级：无 0 / 无凭证 1 / 有凭证 1 条 2 / 有凭证多条 3", () => {
    expect(heatLevel(0, false)).toBe(0);
    expect(heatLevel(2, false)).toBe(1); // 打了但无凭证 → 琥珀
    expect(heatLevel(1, true)).toBe(2);
    expect(heatLevel(3, true)).toBe(3);
  });

  it("count 为 0 时无论凭证标志都视为空（今天/未来空格不填色）", () => {
    expect(heatLevel(0, true)).toBe(0);
  });
});

describe("buildHeatRecords", () => {
  it("无记录 → 窗口内每天一条空记录，长度 26*7 且按日期升序", () => {
    const recs = buildHeatRecords([], TODAY);
    expect(recs).toHaveLength(26 * 7);
    expect(recs[0]).toEqual({ date: WIN_START, count: 0, hasAnyPhoto: false, future: false });
    expect(recs.at(-1)).toEqual({ date: WIN_END, count: 0, hasAnyPhoto: false, future: true });
    const dates = recs.map((r) => r.date);
    expect(dates).toEqual([...dates].sort()); // 升序
  });

  it("future 标记恰好从今天之后开始（今天含今天以前都是 false）", () => {
    const recs = buildHeatRecords([], TODAY);
    expect(recs.filter((r) => r.future).map((r) => r.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(recs.find((r) => r.date === TODAY)?.future).toBe(false);
    // 周日当天访问：窗口最后一天是今天，没有任何 future 格
    const sunday = buildHeatRecords([], "2026-09-06");
    expect(sunday.every((r) => !r.future)).toBe(true);
  });

  it("同日多条聚合计数，任一条有凭证即 hasAnyPhoto", () => {
    const recs = buildHeatRecords(
      [
        { date: TODAY, hasPhoto: false },
        { date: TODAY, hasPhoto: false },
      ],
      TODAY,
    );
    expect(recs.find((r) => r.date === TODAY)).toEqual({ date: TODAY, count: 2, hasAnyPhoto: false, future: false });

    const mixed = buildHeatRecords(
      [
        { date: "2026-08-30", hasPhoto: false },
        { date: "2026-08-30", hasPhoto: true },
      ],
      TODAY,
    );
    expect(mixed.find((r) => r.date === "2026-08-30")).toEqual({
      date: "2026-08-30",
      count: 2,
      hasAnyPhoto: true,
      future: false,
    });
  });

  it("窗口外的历史（含恰好早 26 整周的周一）与超窗未来记录都被裁掉", () => {
    const recs = buildHeatRecords(
      [
        { date: WIN_START, hasPhoto: true }, // 窗口内第一天：保留
        { date: "2026-03-08", hasPhoto: true }, // 起点前一天：裁掉
        { date: "2026-03-02", hasPhoto: true }, // 恰好早 26 整周的周一：裁掉
        { date: "2026-12-31", hasPhoto: true }, // 远未来：裁掉
      ],
      TODAY,
    );
    const filled = recs.filter((r) => r.count > 0);
    expect(filled.map((r) => r.date)).toEqual([WIN_START]);
  });
});

describe("buildSubjectBars", () => {
  const names: Record<number, string> = { 1: "数学", 2: "英语", 3: "政治" };

  it("按总分钟降序，宽度相对最大科目（最大 100%）", () => {
    const bars = buildSubjectBars(
      [
        { subjectId: 2, minutes: 120 },
        { subjectId: 1, minutes: 300 },
        { subjectId: 3, minutes: 60 },
      ],
      names,
    );
    expect(bars.map((b) => b.subjectId)).toEqual([1, 2, 3]);
    expect(bars[0]).toMatchObject({ name: "数学", minutes: 300, hours: "5.0", widthPct: 100 });
    expect(bars[1]).toMatchObject({ minutes: 120, hours: "2.0", widthPct: 40 });
    expect(bars[2]).toMatchObject({ minutes: 60, hours: "1.0", widthPct: 20 });
  });

  it("小时为分钟/60 保留 1 位小数", () => {
    const bars = buildSubjectBars([{ subjectId: 1, minutes: 90 }], names);
    expect(bars[0].hours).toBe("1.5");
    const odd = buildSubjectBars([{ subjectId: 1, minutes: 46 }], names);
    expect(odd[0].hours).toBe("0.8");
  });

  it("0 分钟科目与查不到名字的科目不出现", () => {
    const bars = buildSubjectBars(
      [
        { subjectId: 1, minutes: 30 },
        { subjectId: 2, minutes: 0 },
        { subjectId: 99, minutes: 100 }, // 已不在用户科目表
      ],
      names,
    );
    expect(bars.map((b) => b.name)).toEqual(["数学"]);
  });

  it("同分钟按 subjectId 升序保证稳定；空输入 → 空", () => {
    const bars = buildSubjectBars(
      [
        { subjectId: 3, minutes: 50 },
        { subjectId: 1, minutes: 50 },
      ],
      names,
    );
    expect(bars.map((b) => b.subjectId)).toEqual([1, 3]);
    expect(buildSubjectBars([], names)).toEqual([]);
  });
});
