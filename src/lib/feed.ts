import { getPrisma } from "./db";
import { addDays, canCheckInFor } from "./dates";
import { getDeadlineHour, getSetting } from "./settings";
import { computeStreak } from "./streak";

// ---------- 页面数据形状（全部可序列化，Server Component 直接传给客户端组件）----------

export interface FeedComment {
  id: number;
  authorName: string;
  content: string;
}

export interface FeedCheckIn {
  id: number;
  /** 打卡归属日（近一周窗口内各天混在一起，卡片/分组靠它区分） */
  date: string;
  displayName: string;
  subjectName: string;
  durationMinutes: number;
  note: string;
  hasPhoto: boolean;
  photoIds: number[];
  comments: FeedComment[];
  likeCount: number;
  likedByMe: boolean;
  /** 本人且未过该卡归属日截止（canCheckInFor）：动态流卡片据此显示编辑/删除入口 */
  editable: boolean;
}

/** 动态流的一个「天」组：label 为组标题（今天/昨天… + 日期 + 周几），组内按打卡先后 */
export interface FeedDay {
  date: string;
  label: string;
  checkins: FeedCheckIn[];
}

export interface FeedMember {
  userId: number;
  displayName: string;
  /** 归属日当天是否已打卡（状态区/催一下只关心归属日，不看近一周历史） */
  hasCheckedIn: boolean;
  streak: number;
  /** 我今天是否已催过这个人（Nudge @@unique([from,to,date]) 保证一天一次） */
  nudgeAlreadySentToday: boolean;
}

export interface FeedData {
  /** 当前归属日（defaultCheckInDate）：状态区/nudge 的锚点，动态流窗口的末天 */
  date: string;
  /** Setting.exam_date；未设置或格式不合法为 null */
  examDate: string | null;
  daysToExam: number | null;
  /** 已打卡成员在前，未打卡在后（组内保持 userId 升序） */
  members: FeedMember[];
  /** 近一周打卡按天倒序分组；只列出有记录的天（空天不渲染空组） */
  days: FeedDay[];
}

// ---------- 纯聚合（getFeed 查库后调用，可测）----------

/** 动态流窗口：归属日往前推 FEED_WINDOW_DAYS 天（含归属日） */
export const FEED_WINDOW_DAYS = 7;

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 两个北京日期字符串的天数差（target − from）。"YYYY-MM-DD" 按 UTC 零点解析，差恒为整数天。 */
export function daysBetween(from: string, target: string): number {
  return Math.round((Date.parse(target) - Date.parse(from)) / 86_400_000);
}

/** 分组标题：距今 ≤2 天用相对词（今天/昨天/前天），再往前只写日期；恒带星期。 */
export function dayLabel(date: string, anchor: string): string {
  const diff = daysBetween(date, anchor);
  const [, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAY_ZH[new Date(Date.parse(date)).getUTCDay()];
  const rel = diff === 0 ? "今天 " : diff === 1 ? "昨天 " : diff === 2 ? "前天 " : "";
  return `${rel}${m}月${d}日 · ${weekday}`;
}

/** buildFeed 的输入行：getFeed 把 Prisma 查询结果摊平成这些原始形状 */
interface FeedUserRow {
  id: number;
  displayName: string;
}

interface FeedCheckInRow {
  id: number;
  userId: number;
  /** 打卡归属日（YYYY-MM-DD） */
  date: string;
  subjectName: string;
  durationMinutes: number;
  note: string;
  hasPhoto: boolean;
  photoIds: number[];
  comments: FeedComment[];
  likeUserIds: number[];
}

export interface BuildFeedArgs {
  /** 归属日（北京时间 YYYY-MM-DD）：窗口末天，状态区/nudge 锚点 */
  date: string;
  viewerId: number;
  users: FeedUserRow[];
  /** 近一周窗口内的全部打卡（任意用户） */
  checkIns: FeedCheckInRow[];
  /** 每人 ≤ 归属日的历史打卡日期（streak 输入），缺省视为无记录 */
  streakDatesByUser: Record<number, string[]>;
  /** 我今天已催过的用户 id */
  nudgedUserIds: number[];
  examDate: string;
  /** 「可编辑」裁决用的当前时刻；缺省取真实时钟（测试传固定值保持确定性） */
  now?: Date;
  /** 截止小时（0-23）；缺省用默认 1（测试传固定值，getFeed 从 Setting 读真值） */
  deadlineHour?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildFeed(args: BuildFeedArgs): FeedData {
  const now = args.now ?? new Date();
  const windowStart = addDays(args.date, -(FEED_WINDOW_DAYS - 1));
  const nameOf = new Map(args.users.map((u) => [u.id, u.displayName]));
  const nudged = new Set(args.nudgedUserIds);

  // 摊平成卡片：窗口外记录防御性裁掉（查询已限定，双保险），displayName 跟卡片走
  const cards: FeedCheckIn[] = [];
  const checkedInOnAnchor = new Set<number>();
  for (const r of args.checkIns) {
    if (r.date < windowStart || r.date > args.date) continue;
    if (r.date === args.date) checkedInOnAnchor.add(r.userId);
    cards.push({
      id: r.id,
      date: r.date,
      displayName: nameOf.get(r.userId) ?? "",
      subjectName: r.subjectName,
      durationMinutes: r.durationMinutes,
      note: r.note,
      hasPhoto: r.hasPhoto,
      photoIds: r.photoIds,
      comments: r.comments,
      likeCount: r.likeUserIds.length,
      likedByMe: r.likeUserIds.includes(args.viewerId),
      // 编辑/删除入口的显隐在服务端裁决（时区/截止逻辑不出 dates.ts），
      // 客户端只认这个布尔。按卡片自身归属日裁决：只有归属日当天/补卡
      // 窗口内的卡可编辑，更早的历史卡自然只读。
      editable: r.userId === args.viewerId && canCheckInFor(r.date, now, args.deadlineHour),
    });
  }

  // 按天倒序分组（最新一天在最上）；组内保持传入顺序（查询按 id 升序 = 打卡先后）
  const byDate = new Map<string, FeedCheckIn[]>();
  for (const c of cards) {
    const list = byDate.get(c.date);
    if (list) list.push(c);
    else byDate.set(c.date, [c]);
  }
  const days: FeedDay[] = [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => ({ date, label: dayLabel(date, args.date), checkins: byDate.get(date)! }));

  const members: FeedMember[] = args.users.map((u) => ({
    userId: u.id,
    displayName: u.displayName,
    hasCheckedIn: checkedInOnAnchor.has(u.id),
    // 截止感知在调用方：归属日没打但仍可补卡的人，computeStreak 内部
    // 会回退用昨天锚点，所以直接传归属日即可显示进行中的连续天数。
    streak: computeStreak(args.streakDatesByUser[u.id] ?? [], args.date),
    nudgeAlreadySentToday: nudged.has(u.id),
  }));

  // 已打卡在前；sort 稳定，组内保持 users 传入顺序（userId 升序）
  members.sort((a, b) => Number(b.hasCheckedIn) - Number(a.hasCheckedIn));

  const examDate = DATE_RE.test(args.examDate) ? args.examDate : null;
  return {
    date: args.date,
    examDate,
    daysToExam: examDate ? daysBetween(args.date, examDate) : null,
    members,
    days,
  };
}

// ---------- 查库聚合 ----------

/** 聚合近一周动态流：全员状态 + 7 天打卡（含科目/照片/评论/点赞）+ streak + 催一下状态 + 考试倒计时。 */
export async function getFeed(date: string, viewerId: number): Promise<FeedData> {
  const db = getPrisma();
  const windowStart = addDays(date, -(FEED_WINDOW_DAYS - 1));
  const [users, checkIns, streakRows, nudges, examDate, deadlineHour] = await Promise.all([
    db.user.findMany({ select: { id: true, displayName: true }, orderBy: { id: "asc" } }),
    db.checkIn.findMany({
      where: { date: { gte: windowStart, lte: date } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        userId: true,
        date: true,
        durationMinutes: true,
        note: true,
        hasPhoto: true,
        subject: { select: { name: true } },
        photos: { select: { id: true }, orderBy: { id: "asc" } },
        comments: {
          orderBy: { id: "asc" },
          select: { id: true, content: true, user: { select: { displayName: true } } },
        },
        likes: { select: { userId: true } },
      },
    }),
    // streak 需要每人的全部历史日期（≤ 归属日），distinct 去掉同日多科的重复
    db.checkIn.findMany({
      where: { date: { lte: date } },
      distinct: ["userId", "date"],
      select: { userId: true, date: true },
    }),
    db.nudge.findMany({ where: { fromUserId: viewerId, date }, select: { toUserId: true } }),
    getSetting("exam_date"),
    getDeadlineHour(),
  ]);

  const streakDatesByUser: Record<number, string[]> = {};
  for (const r of streakRows) (streakDatesByUser[r.userId] ??= []).push(r.date);

  return buildFeed({
    date,
    viewerId,
    users,
    checkIns: checkIns.map((c) => ({
      id: c.id,
      userId: c.userId,
      date: c.date,
      subjectName: c.subject.name,
      durationMinutes: c.durationMinutes,
      note: c.note,
      hasPhoto: c.hasPhoto,
      photoIds: c.photos.map((p) => p.id),
      comments: c.comments.map((m) => ({
        id: m.id,
        authorName: m.user.displayName,
        content: m.content,
      })),
      likeUserIds: c.likes.map((l) => l.userId),
    })),
    streakDatesByUser,
    nudgedUserIds: nudges.map((n) => n.toUserId),
    examDate,
    deadlineHour,
  });
}
