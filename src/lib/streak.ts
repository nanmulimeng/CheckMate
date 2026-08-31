import { addDays } from "./dates";

export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  // 从今天（或昨天，今天缺席且未截止视为进行中）往回数连续天数
  let cur = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}
