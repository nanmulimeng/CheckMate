import Link from "next/link";
import { redirect } from "next/navigation";
import CheckinCard from "@/components/checkin-card";
import CountdownBar from "@/components/countdown-bar";
import LogoutButton from "@/components/logout-button";
import MemberStatus from "@/components/member-status";
import NudgeButton from "@/components/nudge-button";
import SiteNav from "@/components/site-nav";
import WeekProgressCard from "@/components/week-progress-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr, defaultCheckInDate, mondayOf } from "@/lib/dates";
import { getFeed } from "@/lib/feed";
import { getDeadlineHour } from "@/lib/settings";
import { weekProgress } from "@/lib/weekly";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

// 动态流（核心页）：显示归属日往前近一周的打卡记录，按天倒序分组——
// 过了凌晨截止旧记录不再从首页「翻篇消失」。状态区/催一下仍以归属日
// （defaultCheckInDate）为锚：凌晨补卡窗口内照样显示昨天谁没打。
// 全部日期/streak/倒计时计算都在服务端 lib 完成，组件只消费字符串与数字。
export default async function Home(props: PageProps<"/">) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const me = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true, weeklyGoalDays: true },
  });
  if (!me) redirect("/login");

  const now = new Date();
  const [deadlineHour, sp] = await Promise.all([getDeadlineHour(), props.searchParams]);
  const feed = await getFeed(defaultCheckInDate(now, deadlineHour), me.id);

  // 本周保底进度条：按归属日所在自然周（feed 的 7 天窗口是滚动的，不是自然周），
  // 单独查我本周的打卡。todayMinutes 顺带从同一份行里聚合。
  const db = getPrisma();
  const weekStart = mondayOf(feed.date);
  const myWeek = await db.checkIn.findMany({
    where: { userId: me.id, date: { gte: weekStart, lte: feed.date } },
    select: { date: true, durationMinutes: true },
  });
  const progress = weekProgress(
    weekStart,
    feed.date,
    me.weeklyGoalDays,
    myWeek.map((r) => r.date),
    deadlineHour,
  );
  const todayMinutes = myWeek
    .filter((r) => r.date === feed.date)
    .reduce((a, r) => a + r.durationMinutes, 0);

  // ?done=YYYY-MM-DD：打卡成功的确认横幅（checkin-form 提交后跳转带上）
  const doneParam = typeof sp.done === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.done) ? sp.done : null;
  // &again=N：刚记的科目 id —— 横幅里「再来一条」直达打卡页并预选该科目
  const againSubjectId =
    doneParam && typeof sp.again === "string" && /^\d+$/.test(sp.again) ? sp.again : null;
  const makeup = feed.date !== beijingDateStr(now);
  // 还没打卡名单（含催一下按钮）放在成员状态区上方：打开首页首屏即可催，
  // 不用翻完整个近一周动态流拉到最底部。
  const pending = feed.members.filter((m) => !m.hasCheckedIn);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin={me.isAdmin} />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">近一周动态</h1>
          <p className="text-xs text-muted-foreground">
            {feed.date}（北京时间）{makeup && " · 补卡时段"}
          </p>
        </div>
        <LogoutButton />
      </header>

      <CountdownBar examDate={feed.examDate} daysToExam={feed.daysToExam} />

      <WeekProgressCard progress={progress} todayMinutes={todayMinutes} dayLabel={makeup ? "昨天" : "今天"} />

      {doneParam && (
        <p
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          <span>已记入 {doneParam} ✓</span>
          {againSubjectId && (
            <Link
              href={`/checkin/new?subject=${againSubjectId}`}
              className="shrink-0 rounded-md border border-emerald-300 px-2 py-0.5 text-xs underline-offset-2 hover:underline dark:border-emerald-500/40"
            >
              再来一条
            </Link>
          )}
        </p>
      )}

      {pending.length > 0 && (
        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              还没打卡（{pending.length} 人）
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pending.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm">
                  {m.displayName}
                  <span className="text-xs text-muted-foreground"> · 连续 {m.streak} 天</span>
                </p>
                {m.userId === me.id ? (
                  <span className="shrink-0 text-xs text-muted-foreground">就是你，快去打卡</span>
                ) : (
                  <NudgeButton userId={m.userId} alreadySent={m.nudgeAlreadySentToday} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <MemberStatus members={feed.members} />

      {feed.days.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          最近一周还没有打卡记录，来做第一个吧。
        </p>
      )}
      {feed.days.map((day) => (
        <section key={day.date} aria-label={`${day.label}打卡`} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-xs font-medium text-muted-foreground">{day.label}</h2>
          {day.checkins.map((c) => (
            <CheckinCard key={c.id} data={c} />
          ))}
        </section>
      ))}
    </main>
  );
}
