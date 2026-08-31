import { getPrisma } from "./db";
import { canCheckInFor } from "./dates";
import { getSetting } from "./settings";
import { computeStreak } from "./streak";

// ---------- 页面数据形状（全部可序列化，Server Component 直接传给客户端组件）----------

export interface FeedComment {
  id: number;
  authorName: string;
  content: string;
}

export interface FeedCheckIn {
  id: number;
  subjectName: string;
  durationMinutes: number;
  note: string;
  hasPhoto: boolean;
  photoIds: number[];
  comments: FeedComment[];
  likeCount: number;
  likedByMe: boolean;
  /** 本人且未过截止（canCheckInFor）：动态流卡片据此显示编辑/删除入口 */
  editable: boolean;
}

export interface FeedMember {
  userId: number;
  displayName: string;
  hasCheckedIn: boolean;
  streak: number;
  checkins: FeedCheckIn[];
  /** 我今天是否已催过这个人（Nudge @@unique([from,to,date]) 保证一天一次） */
  nudgeAlreadySentToday: boolean;
}

export interface FeedData {
  date: string;
  /** Setting.exam_date；未设置或格式不合法为 null */
  examDate: string | null;
  daysToExam: number | null;
  /** 已打卡成员在前，未打卡在后（组内保持 userId 升序） */
  members: FeedMember[];
}

// ---------- 纯聚合（getFeed 查库后调用，可测）----------

/** buildFeed 的输入行：getFeed 把 Prisma 查询结果摊平成这些原始形状 */
interface FeedUserRow {
  id: number;
  displayName: string;
}

interface FeedCheckInRow {
  id: number;
  userId: number;
  subjectName: string;
  durationMinutes: number;
  note: string;
  hasPhoto: boolean;
  photoIds: number[];
  comments: FeedComment[];
  likeUserIds: number[];
}

export interface BuildFeedArgs {
  /** 动态流日期（北京时间 YYYY-MM-DD） */
  date: string;
  viewerId: number;
  users: FeedUserRow[];
  /** 当天的全部打卡（任意用户） */
  checkIns: FeedCheckInRow[];
  /** 每人 ≤ date 的历史打卡日期（streak 输入），缺省视为无记录 */
  streakDatesByUser: Record<number, string[]>;
  /** 我今天已催过的用户 id */
  nudgedUserIds: number[];
  examDate: string;
  /** 「可编辑」裁决用的当前时刻；缺省取真实时钟（测试传固定值保持确定性） */
  now?: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 两个北京日期字符串的天数差（target − from）。"YYYY-MM-DD" 按 UTC 零点解析，差恒为整数天。 */
export function daysBetween(from: string, target: string): number {
  return Math.round((Date.parse(target) - Date.parse(from)) / 86_400_000);
}

export function buildFeed(args: BuildFeedArgs): FeedData {
  const now = args.now ?? new Date();
  const checkInsByUser = new Map<number, FeedCheckInRow[]>();
  for (const c of args.checkIns) {
    const list = checkInsByUser.get(c.userId);
    if (list) list.push(c);
    else checkInsByUser.set(c.userId, [c]);
  }
  const nudged = new Set(args.nudgedUserIds);

  const members: FeedMember[] = args.users.map((u) => {
    const rows = checkInsByUser.get(u.id) ?? [];
    return {
      userId: u.id,
      displayName: u.displayName,
      hasCheckedIn: rows.length > 0,
      // 截止感知在调用方：今天没打但仍可补卡的人，computeStreak 内部
      // 会回退用昨天锚点，所以直接传 today 即可显示进行中的连续天数。
      streak: computeStreak(args.streakDatesByUser[u.id] ?? [], args.date),
      checkins: rows.map((r) => ({
        id: r.id,
        subjectName: r.subjectName,
        durationMinutes: r.durationMinutes,
        note: r.note,
        hasPhoto: r.hasPhoto,
        photoIds: r.photoIds,
        comments: r.comments,
        likeCount: r.likeUserIds.length,
        likedByMe: r.likeUserIds.includes(args.viewerId),
        // 编辑/删除入口的显隐在服务端裁决（时区/截止逻辑不出 dates.ts），
        // 客户端只认这个布尔，不自己推算。动态流按 args.date 查询，
        // 这里 r.date 恒等于它，直接用查询日做截止裁决。
        editable: r.userId === args.viewerId && canCheckInFor(args.date, now),
      })),
      nudgeAlreadySentToday: nudged.has(u.id),
    };
  });

  // 已打卡在前；sort 稳定，组内保持 users 传入顺序（userId 升序）
  members.sort((a, b) => Number(b.hasCheckedIn) - Number(a.hasCheckedIn));

  const examDate = DATE_RE.test(args.examDate) ? args.examDate : null;
  return {
    date: args.date,
    examDate,
    daysToExam: examDate ? daysBetween(args.date, examDate) : null,
    members,
  };
}

// ---------- 查库聚合 ----------

/** 聚合某天的动态流：全员 + 当天打卡（含科目/照片/评论/点赞）+ streak + 催一下状态 + 考试倒计时。 */
export async function getFeed(date: string, viewerId: number): Promise<FeedData> {
  const db = getPrisma();
  const [users, checkIns, streakRows, nudges, examDate] = await Promise.all([
    db.user.findMany({ select: { id: true, displayName: true }, orderBy: { id: "asc" } }),
    db.checkIn.findMany({
      where: { date },
      orderBy: { id: "asc" },
      select: {
        id: true,
        userId: true,
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
    // streak 需要每人的全部历史日期（≤ date），distinct 去掉同日多科的重复
    db.checkIn.findMany({
      where: { date: { lte: date } },
      distinct: ["userId", "date"],
      select: { userId: true, date: true },
    }),
    db.nudge.findMany({ where: { fromUserId: viewerId, date }, select: { toUserId: true } }),
    getSetting("exam_date"),
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
  });
}
