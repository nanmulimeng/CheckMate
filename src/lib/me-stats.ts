import { getPrisma } from "./db";
import { addDays, beijingDateStr, dateRange, mondayOf } from "./dates";
import { computeStreak } from "./streak";

// 个人页（/me）聚合：热力图窗口/色阶映射/科目横条都是纯函数（可测），
// getMeStats 查库后拼装。streak/累计值统计全部历史，热力图只看近 26 周。

export const HEATMAP_WEEKS = 26;

/** 热力图一格：某天的打卡条数与是否带凭证（服务端聚合后传给组件） */
export interface HeatRecord {
  date: string;
  count: number;
  hasAnyPhoto: boolean;
  /** 窗口内但晚于今天的格子（本周未来天）：组件渲染成透明占位，不当「无打卡」误导 */
  future: boolean;
}

/** 科目横条：总分钟（原始值）+ 展示用小时字符串 + 相对最大科目的宽度百分比 */
export interface SubjectBar {
  subjectId: number;
  name: string;
  minutes: number;
  hours: string;
  widthPct: number;
}

export interface MeStats {
  today: string;
  streak: number;
  /** 累计打卡天数（全部历史，按日期去重） */
  totalDays: number;
  /** 累计时长（分钟，全部历史） */
  totalMinutes: number;
  /** 近 26 周窗口，周一起始按周分列，长度恒为 26*7（含空天；本周未来天标 future） */
  heatRecords: HeatRecord[];
  /** 按总分钟降序的科目横条；全部为 0 时为空数组 */
  subjects: SubjectBar[];
}

/** 四级色阶下标：0 无 / 1 无凭证 / 2 有凭证 1 条 / 3 有凭证多条 */
export function heatLevel(count: number, hasAnyPhoto: boolean): number {
  if (count <= 0) return 0; // 空格不填色（未来格在组件层直接透明，不走到这）
  if (!hasAnyPhoto) return 1;
  return count === 1 ? 2 : 3;
}

/** 热力图窗口：本周一往前推 25 周为起点，终点为本周日（与当天是周几无关） */
export function heatmapWindow(today: string): { start: string; end: string } {
  const start = addDays(mondayOf(today), -(HEATMAP_WEEKS - 1) * 7);
  return { start, end: addDays(start, HEATMAP_WEEKS * 7 - 1) };
}

/** 全部打卡行 → 窗口内逐日聚合（窗口外历史直接裁掉，不进组件） */
export function buildHeatRecords(
  rows: { date: string; hasPhoto: boolean }[],
  today: string,
): HeatRecord[] {
  const { start, end } = heatmapWindow(today);
  const byDate = new Map<string, { count: number; hasAnyPhoto: boolean }>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const cur = byDate.get(r.date) ?? { count: 0, hasAnyPhoto: false };
    cur.count += 1;
    if (r.hasPhoto) cur.hasAnyPhoto = true;
    byDate.set(r.date, cur);
  }
  // 打卡行不可能晚于今天（canCheckInFor 防穿越），future 只由日历窗口产生
  return dateRange(start, end).map((date) => {
    const r = byDate.get(date);
    return { date, count: r?.count ?? 0, hasAnyPhoto: r?.hasAnyPhoto ?? false, future: date > today };
  });
}

/** 按科目总分钟 → 横条列表：0 分钟与名字缺失的不出现；宽度相对最大科目 */
export function buildSubjectBars(
  sums: { subjectId: number; minutes: number }[],
  names: Record<number, string>,
): SubjectBar[] {
  const bars = sums
    .filter((s) => s.minutes > 0 && names[s.subjectId] != null)
    .map((s) => ({
      subjectId: s.subjectId,
      name: names[s.subjectId],
      minutes: s.minutes,
      hours: (s.minutes / 60).toFixed(1),
      widthPct: 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.subjectId - b.subjectId);
  const max = bars[0]?.minutes ?? 0;
  return bars.map((b) => ({ ...b, widthPct: max > 0 ? (b.minutes / max) * 100 : 0 }));
}

/** 聚合当前用户的个人统计：streak + 累计值（全历史）+ 近 26 周热力图 + 科目横条 */
export async function getMeStats(userId: number): Promise<MeStats> {
  const db = getPrisma();
  const today = beijingDateStr(new Date());
  const [rows, sums, subjects] = await Promise.all([
    db.checkIn.findMany({ where: { userId }, select: { date: true, hasPhoto: true } }),
    db.checkIn.groupBy({
      by: ["subjectId"],
      where: { userId },
      _sum: { durationMinutes: true },
    }),
    db.subject.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  const dates = [...new Set(rows.map((r) => r.date))];
  const names: Record<number, string> = {};
  for (const s of subjects) names[s.id] = s.name;

  return {
    today,
    streak: computeStreak(dates, today),
    totalDays: dates.length,
    totalMinutes: sums.reduce((n, s) => n + (s._sum.durationMinutes ?? 0), 0),
    heatRecords: buildHeatRecords(rows, today),
    subjects: buildSubjectBars(
      sums.map((s) => ({ subjectId: s.subjectId, minutes: s._sum.durationMinutes ?? 0 })),
      names,
    ),
  };
}
