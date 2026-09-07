import { addDays } from "./dates";
import { owedDays } from "./weekly";

// 个人成就墙：只和自己比的长期里程碑。判定全部是纯函数——页面/推送传
// 聚合值进来，解锁规则集中在这张表里改。v1 不记录解锁日期，只判在不在。

/** 与 weeklyBadges 的 STREAK_CAP 同语义：无注册信息的老用户回看上限 */
const MAX_WEEKS = 52;

export interface WeeklyAchievementFacts {
  /** 历史最长连续达标周数（按自己的保底算，注册周折算） */
  bestGoalStreak: number;
  /** 全勤周数（应付天数零缺卡） */
  fullWeeks: number;
  /** 知耻后勇：最近完整周达标且其前一周存在且未达标 */
  comeback: boolean;
}

/** 逐周扫描我的全部打卡日期，产出成就墙需要的周维度事实。
 *  达标口径与 weeklyBadges 一致：dayCount >= min(goalDays, owedDays)。 */
export function weeklyAchievementFacts(
  dates: string[],
  goalDays: number,
  registeredOn: string | undefined,
  lastFullWeekStart: string,
): WeeklyAchievementFacts {
  const daySet = new Set(dates);
  // 周列表从早到晚：起点是注册周的周一（无注册信息回看最多 MAX_WEEKS 周）
  const weeks: string[] = [];
  let ws = lastFullWeekStart;
  for (let i = 0; i < MAX_WEEKS; i++) {
    weeks.push(ws);
    const prev = addDays(ws, -7);
    // 整周在注册前 → 周不存在，到头（注册周本身周末 ≥ 注册日，仍算）
    if (registeredOn ? addDays(prev, 6) < registeredOn : i + 1 >= MAX_WEEKS) break;
    ws = prev;
  }
  weeks.reverse();

  let streak = 0;
  let bestGoalStreak = 0;
  let fullWeeks = 0;
  const goalMetByWeek: boolean[] = [];
  for (const w of weeks) {
    const owed = owedDays(w, registeredOn);
    let cnt = 0;
    for (let i = 0; i < 7; i++) if (daySet.has(addDays(w, i))) cnt++;
    const goalMet = cnt > 0 && cnt >= Math.min(goalDays, owed);
    goalMetByWeek.push(goalMet);
    if (goalMet) {
      streak++;
      bestGoalStreak = Math.max(bestGoalStreak, streak);
    } else streak = 0;
    if (cnt > 0 && cnt === owed) fullWeeks++;
  }

  const comeback =
    goalMetByWeek.length >= 2 && goalMetByWeek.at(-1) === true && goalMetByWeek.at(-2) === false;
  return { bestGoalStreak, fullWeeks, comeback };
}

export interface AchievementTotals {
  totalMinutes: number;
  totalDays: number;
  /** 带照片的打卡条数（不是天数） */
  photoCount: number;
  bestGoalStreak: number;
  fullWeeks: number;
  comeback: boolean;
}

export type AchievementIcon = "clock" | "calendar" | "flame" | "star" | "camera" | "trending";

export interface Achievement {
  key: string;
  icon: AchievementIcon;
  title: string;
  detail: string;
  unlocked: boolean;
}

interface AchievementDef extends Omit<Achievement, "unlocked"> {
  test: (t: AchievementTotals) => boolean;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: "h50", icon: "clock", title: "初入状态", detail: "累计学习满 50 小时", test: (t) => t.totalMinutes >= 50 * 60 },
  { key: "h100", icon: "clock", title: "百小时俱乐部", detail: "累计学习满 100 小时", test: (t) => t.totalMinutes >= 100 * 60 },
  { key: "h300", icon: "clock", title: "深潜三百", detail: "累计学习满 300 小时", test: (t) => t.totalMinutes >= 300 * 60 },
  { key: "h500", icon: "clock", title: "五百小时老将", detail: "累计学习满 500 小时", test: (t) => t.totalMinutes >= 500 * 60 },
  { key: "d30", icon: "calendar", title: "三十而立", detail: "累计打卡满 30 天", test: (t) => t.totalDays >= 30 },
  { key: "d60", icon: "calendar", title: "六十日行军", detail: "累计打卡满 60 天", test: (t) => t.totalDays >= 60 },
  { key: "d100", icon: "calendar", title: "百日筑基", detail: "累计打卡满 100 天", test: (t) => t.totalDays >= 100 },
  { key: "w4", icon: "flame", title: "四周之火", detail: "连续 4 周达到自己的保底", test: (t) => t.bestGoalStreak >= 4 },
  { key: "w8", icon: "flame", title: "长明八周", detail: "连续 8 周达到自己的保底", test: (t) => t.bestGoalStreak >= 8 },
  { key: "w12", icon: "flame", title: "十二周不熄", detail: "连续 12 周达到自己的保底", test: (t) => t.bestGoalStreak >= 12 },
  { key: "f1", icon: "star", title: "完美一周", detail: "拿下 1 个全勤周", test: (t) => t.fullWeeks >= 1 },
  { key: "f4", icon: "star", title: "月度满分", detail: "拿下 4 个全勤周", test: (t) => t.fullWeeks >= 4 },
  { key: "p50", icon: "camera", title: "凭证收藏家", detail: "提交 50 条带照片的打卡", test: (t) => t.photoCount >= 50 },
  { key: "cb", icon: "trending", title: "知耻后勇", detail: "上周没达标，这周达标", test: (t) => t.comeback },
];

export function computeAchievements(t: AchievementTotals): Achievement[] {
  return ACHIEVEMENT_DEFS.map(({ key, icon, title, detail, test }) => ({
    key,
    icon,
    title,
    detail,
    unlocked: test(t),
  }));
}
