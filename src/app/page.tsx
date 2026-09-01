import { redirect } from "next/navigation";
import CheckinCard from "@/components/checkin-card";
import CountdownBar from "@/components/countdown-bar";
import LogoutButton from "@/components/logout-button";
import MemberStatus from "@/components/member-status";
import NudgeButton from "@/components/nudge-button";
import SiteNav from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr, defaultCheckInDate } from "@/lib/dates";
import { getFeed } from "@/lib/feed";
import { getDeadlineHour } from "@/lib/settings";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

// 今日动态流（核心页）：跟随打卡归属日（defaultCheckInDate）——
// 凌晨补卡窗口内显示昨天的流，补完昨天的卡跳回来立刻能看到，
// 而不是被「今天还没有人打卡」糊一脸。全部日期/streak/倒计时
// 计算都在服务端 lib 完成，组件只消费字符串与数字。
export default async function Home(props: PageProps<"/">) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const me = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
  });
  if (!me) redirect("/login");

  const now = new Date();
  const [deadlineHour, sp] = await Promise.all([getDeadlineHour(), props.searchParams]);
  const feed = await getFeed(defaultCheckInDate(now, deadlineHour), me.id);

  // ?done=YYYY-MM-DD：打卡成功的确认横幅（checkin-form 提交后跳转带上）
  const doneParam = typeof sp.done === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.done) ? sp.done : null;
  const makeup = feed.date !== beijingDateStr(now);
  const done = feed.members.filter((m) => m.hasCheckedIn);
  const pending = feed.members.filter((m) => !m.hasCheckedIn);
  const totalCheckins = feed.members.reduce((n, m) => n + m.checkins.length, 0);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin={me.isAdmin} />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">今日动态</h1>
          <p className="text-xs text-muted-foreground">
            {feed.date}（北京时间）{makeup && " · 补卡时段"}
          </p>
        </div>
        <LogoutButton />
      </header>

      <CountdownBar examDate={feed.examDate} daysToExam={feed.daysToExam} />

      {doneParam && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          已记入 {doneParam} ✓
        </p>
      )}

      <MemberStatus members={feed.members} />

      <section aria-label="今日打卡动态" className="flex flex-col gap-3">
        {totalCheckins === 0 && (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            今天还没有人打卡，来做第一个吧。
          </p>
        )}
        {done.map((m) =>
          m.checkins.map((c) => (
            <CheckinCard key={c.id} data={{ ...c, displayName: m.displayName }} />
          )),
        )}
      </section>

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
    </main>
  );
}
