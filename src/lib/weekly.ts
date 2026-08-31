import { dateRange, addDays } from "./dates";

export interface WeeklyStat {
  userId: number; displayName: string;
  days: number; totalMinutes: number; noProofDays: number; missedDays: number;
}

/** 该用户在本周的「应打天数」：7 天里 ≥ 注册日的部分。
 *  注册日在周开始前（或未提供，视为老用户）→ 7；在周末之后 → 0。 */
export function owedDays(weekStart: string, registeredOn?: string): number {
  if (!registeredOn) return 7;
  const weekEnd = addDays(weekStart, 6);
  if (registeredOn <= weekStart) return 7;
  if (registeredOn > weekEnd) return 0;
  return dateRange(registeredOn, weekEnd).length;
}

export function computeWeekly(
  rows: { userId: number; displayName: string; date: string; durationMinutes: number; hasPhoto: boolean }[],
  weekStart: string,
  registeredOnByUser?: Map<number, string>
): WeeklyStat[] {
  const days = new Set(dateRange(weekStart, addDays(weekStart, 6)));
  const byUser = new Map<number, WeeklyStat>();
  const daySet = new Map<number, Set<string>>();   // 每人打过的日期
  const proofSet = new Map<number, Set<string>>(); // 每人“有凭证”的日期

  for (const r of rows) {
    if (!days.has(r.date)) continue;
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, { userId: r.userId, displayName: r.displayName, days: 0, totalMinutes: 0, noProofDays: 0, missedDays: 0 });
      daySet.set(r.userId, new Set());
      proofSet.set(r.userId, new Set());
    }
    byUser.get(r.userId)!.totalMinutes += r.durationMinutes;
    daySet.get(r.userId)!.add(r.date);
    if (r.hasPhoto) proofSet.get(r.userId)!.add(r.date);
  }
  for (const s of byUser.values()) {
    s.days = daySet.get(s.userId)!.size;
    // 口径与个人页热力图一致：当天任一条打卡带照片即“有凭证”，整天全无照片才算无凭证天
    s.noProofDays = s.days - proofSet.get(s.userId)!.size;
    // 缺卡只算「注册之后应打而未打」的天：注册前的日子不算欠账，
    // 否则新用户第一天就顶着「上周缺卡 7 天 + 奶茶候选人」开局。
    s.missedDays = owedDays(weekStart, registeredOnByUser?.get(s.userId)) - s.days;
  }
  return [...byUser.values()];
}
