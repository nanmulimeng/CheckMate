import { dateRange, addDays } from "./dates";

export interface WeeklyStat {
  userId: number; displayName: string;
  days: number; totalMinutes: number; noProofDays: number; missedDays: number;
}

export function computeWeekly(
  rows: { userId: number; displayName: string; date: string; durationMinutes: number; hasPhoto: boolean }[],
  weekStart: string
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
    s.missedDays = 7 - s.days;
  }
  return [...byUser.values()];
}
