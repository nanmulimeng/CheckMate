// 北京时区无夏令时：UTC 17:00 恒等于北京次日 01:00。
const BJ = "Asia/Shanghai";

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

// dateStr 次日北京 01:00 = dateStr 当天 UTC 17:00
export function deadlineOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
}

export function canCheckInFor(dateStr: string, now: Date): boolean {
  const today = beijingDateStr(now);
  if (dateStr !== today && dateStr !== addDays(today, -1)) return false; // 只允许今天/昨天
  return now.getTime() < deadlineOf(dateStr).getTime();
}

export function defaultCheckInDate(now: Date): string {
  const today = beijingDateStr(now);
  return beijingHour(now) < 1 ? addDays(today, -1) : today;
}

export function lastMonday(now: Date): string {
  const today = beijingDateStr(now);
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=周日
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back - 7);
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
