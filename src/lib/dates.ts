// 北京时区无夏令时：UTC 17:00 恒等于北京次日 01:00。
// 打卡截止小时（deadlineHour）可由管理员在 /admin 配置：语义是
// 「打卡日 D 的记录截止到 D+1 的该小时（北京时间）」，默认 1 = 次日 01:00。
const BJ = "Asia/Shanghai";

/** 默认截止小时：Setting.deadline_hour 缺失/脏值时的回退 */
export const DEFAULT_DEADLINE_HOUR = 1;

export function beijingDateStr(d: Date): string {
  // en-CA locale 输出 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: BJ }).format(d);
}

export function beijingHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: BJ, hour: "2-digit", hour12: false }).format(d));
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// dateStr 次日北京 deadlineHour:00 = dateStr 当天 UTC (deadlineHour+16) 点
export function deadlineOf(dateStr: string, deadlineHour: number = DEFAULT_DEADLINE_HOUR): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  // 北京 = UTC+8：次日 H:00 即当天 UTC (H+16) 点（H=1 → 17；
  // H≥8 时 Date.UTC 自动进位到次日，无需取模）
  return new Date(Date.UTC(y, m - 1, d, deadlineHour + 16, 0, 0));
}

export function canCheckInFor(
  dateStr: string,
  now: Date,
  deadlineHour: number = DEFAULT_DEADLINE_HOUR,
): boolean {
  const today = beijingDateStr(now);
  if (dateStr !== today && dateStr !== addDays(today, -1)) return false; // 只允许今天/昨天
  return now.getTime() < deadlineOf(dateStr, deadlineHour).getTime();
}

export function defaultCheckInDate(
  now: Date,
  deadlineHour: number = DEFAULT_DEADLINE_HOUR,
): string {
  const today = beijingDateStr(now);
  return beijingHour(now) < deadlineHour ? addDays(today, -1) : today;
}

/** dateStr 所在周的周一（字符串日期运算，纯函数） */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=周日
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

export function lastMonday(now: Date): string {
  return addDays(mondayOf(beijingDateStr(now)), -7);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
