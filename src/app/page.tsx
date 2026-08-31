import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import CheckinCard from "@/components/checkin-card";
import CountdownBar from "@/components/countdown-bar";
import MemberStatus from "@/components/member-status";
import NudgeButton from "@/components/nudge-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr } from "@/lib/dates";
import { getFeed } from "@/lib/feed";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

// 今日动态流（核心页）：只看「今天」（北京时间）。
// 全部日期/streak/倒计时计算都在服务端 lib 完成，组件只消费字符串与数字。
export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const me = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (!me) redirect("/login");

  const feed = await getFeed(beijingDateStr(new Date()), me.id);
  const done = feed.members.filter((m) => m.hasCheckedIn);
  const pending = feed.members.filter((m) => !m.hasCheckedIn);
  const totalCheckins = feed.members.reduce((n, m) => n + m.checkins.length, 0);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">今日动态</h1>
          <p className="text-xs text-muted-foreground">{feed.date}（北京时间）</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/checkin/new">记一笔</Link>
          </Button>
          <LogoutButton />
        </div>
      </header>

      <CountdownBar examDate={feed.examDate} daysToExam={feed.daysToExam} />
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
