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
    // 否则新用户第一天就顶着「上周缺卡 7 天」开局。夹紧到 0：
    // 注册日凌晨补过昨天的卡时 days 可能超过 owed，负数没有意义
    // （且会让 isFullAttendance 在本路径与 weeklyBadges 的判定分叉）。
    s.missedDays = Math.max(0, owedDays(weekStart, registeredOnByUser?.get(s.userId)) - s.days);
  }
  return [...byUser.values()];
}

/** 全勤：参与了（至少打了一天）且应付天数零缺卡。应付 0 天（未参与）不算。 */
export function isFullAttendance(s: Pick<WeeklyStat, "days" | "missedDays">): boolean {
  return s.days > 0 && s.missedDays === 0;
}

/** 周结算徽章：只和自己比——保底达标 / 全勤 / 连续达标周数 / 较上周进步。
 *  goalDays 是本人的每周保底打卡天数（1-7，User.weeklyGoalDays，各自在设置页改，
 *  课多的设低些、全力备考的设高些——奖惩基准是「自己的承诺」而非别人）。
 *  rows 传注册以来全部打卡（混了别人的也行，内部按 userId 过滤）；
 *  weekStart 是要结算的周（周一）。连续链在第一个未达标周或注册前的周处断开；
 *  注册周应付天数不足保底时按剩余天数折算达标线（周三注册不该背 6 天的债）。 */
export interface WeeklyBadges {
  goalMet: boolean;
  full: boolean;
  streak: number; // 连续达标周数，含本周；本周未达标为 0
  improved: boolean; // 打卡天数比上周多（上周须已注册存在）
}

// 老用户无注册信息时 streak 往前数的兜底上限：考研一年 52 周足够
const STREAK_CAP = 52;

export function weeklyBadges(
  userId: number,
  rows: { userId: number; date: string; durationMinutes: number; hasPhoto: boolean }[],
  weekStart: string,
  goalDays: number,
  registeredOn?: string,
): WeeklyBadges {
  const mine = rows.filter((r) => r.userId === userId);

  const statOf = (ws: string) => {
    const days = new Set(dateRange(ws, addDays(ws, 6)));
    const dayCount = new Set(mine.filter((r) => days.has(r.date)).map((r) => r.date)).size;
    const owed = owedDays(ws, registeredOn);
    return {
      days: dayCount,
      missedDays: Math.max(0, owed - dayCount),
      // owed=0（整周在注册之后）：这周对本人不存在，谈不上达标与否——
      // 判 false 且调用方应把该成员排除出奖惩/分母，而不是挂「未达标」
      goalMet: owed > 0 && dayCount >= Math.min(goalDays, owed),
    };
  };

  const thisWeek = statOf(weekStart);
  const full = isFullAttendance(thisWeek);

  let streak = 0;
  let ws = weekStart;
  for (let i = 0; i < STREAK_CAP; i++) {
    // 整周都在注册前 → 周不存在，链到此为止（注册周本身周末 >= 注册日，仍会被检查）
    if (registeredOn && addDays(ws, 6) < registeredOn) break;
    if (!statOf(ws).goalMet) break;
    streak++;
    ws = addDays(ws, -7);
  }

  // 上周存在 = 上周至少有一天在注册之后（无注册信息视为老用户，恒存在）
  const lastStart = addDays(weekStart, -7);
  const lastExisted = !registeredOn || addDays(lastStart, 6) >= registeredOn;
  const improved = lastExisted && thisWeek.days > statOf(lastStart).days;

  return { goalMet: thisWeek.goalMet, full, streak, improved };
}

// ---------- 首页「本周保底」进度条 ----------

export interface WeekCell {
  date: string;
  /** 周几单字（周一=「一」…周日=「日」），格子下方的小标签 */
  label: string;
  checked: boolean;
  state: "past" | "today" | "future";
}

export interface WeekProgress {
  cells: WeekCell[];
  /** 本周打卡天数（截至 today，同日多条算一天） */
  days: number;
  goalDays: number;
  /** 距保底还差几天（已达为 0） */
  remaining: number;
  /** 激励文案：已达标 / 进行中 / 本周最后一天的截止提醒 */
  text: string;
}

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** 首页本周保底进度条（纯展示数据，服务端算好）。
 *  weekStart 是 today 所在自然周的周一；checkedDates 传本人本周的打卡
 *  日期（混入别周的日期会被窗口过滤；同日多条去重）。
 *  「今天」按归属日（defaultCheckInDate）算：凌晨补卡窗口内进度条
 *  还停在昨天那格，与动态流口径一致。 */
export function weekProgress(
  weekStart: string,
  today: string,
  goalDays: number,
  checkedDates: string[],
  deadlineHour = 1,
): WeekProgress {
  const weekEnd = addDays(weekStart, 6);
  const checked = new Set(checkedDates.filter((d) => d >= weekStart && d <= weekEnd));
  const cells: WeekCell[] = dateRange(weekStart, weekEnd).map((date) => ({
    date,
    label: WEEKDAY_LABEL[new Date(Date.parse(date)).getUTCDay()],
    checked: checked.has(date),
    state: date < today ? "past" : date === today ? "today" : "future",
  }));
  const days = checked.size;
  const remaining = Math.max(0, goalDays - days);
  const hh = String(deadlineHour).padStart(2, "0");
  const text =
    remaining === 0
      ? "已达到本周保底"
      : today < weekEnd
        ? `再打 ${remaining} 天达到本周保底`
        : `本周最后一天 · 截止明天 ${hh}:00 前打卡还算数`;
  return { cells, days, goalDays, remaining, text };
}

export interface WeekStripCell {
  date: string;
  /** 周几单字（一~日） */
  label: string;
  checked: boolean;
  /** 当天任一条打卡带照片（周条上的相机角标） */
  hasPhoto: boolean;
  /** 超出保底天数的格子（第 goalDays+1 格起）：虚线空框，表示保底之外的加成区 */
  beyondGoal: boolean;
}

/** 周结算成员行的 7 格周条。rows 传本人本周的打卡（混入窗口外的日期会被过滤，
 *  同日多条合并：checked 去重、hasPhoto 取或）。 */
export function weekStrip(
  weekStart: string,
  goalDays: number,
  rows: { date: string; hasPhoto: boolean }[],
): WeekStripCell[] {
  const weekEnd = addDays(weekStart, 6);
  const byDate = new Map<string, boolean>(); // date -> hasPhoto（或）
  for (const r of rows) {
    if (r.date < weekStart || r.date > weekEnd) continue;
    byDate.set(r.date, byDate.get(r.date) || r.hasPhoto);
  }
  return dateRange(weekStart, weekEnd).map((date, i) => ({
    date,
    label: WEEKDAY_LABEL[new Date(Date.parse(date)).getUTCDay()],
    checked: byDate.has(date),
    hasPhoto: byDate.get(date) === true,
    beyondGoal: i >= goalDays,
  }));
}
