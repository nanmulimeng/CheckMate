import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import SiteNav from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { addDays, lastMonday, mondayOf } from "@/lib/dates";
import { getPrisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { computeWeekly, type WeeklyStat } from "@/lib/weekly";

// 登录守卫：读取 session 必须走动态渲染（与首页同款模式）
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 合法的回看周：YYYY-MM-DD、恰好是周一、且不晚于最近一个完整周 */
function isViewableWeek(week: string, latest: string): boolean {
  // mondayOf 对越界日期（如 2026-02-30）经 UTC 滚动后回不到原串，可挡格式合法但语义非法的值
  return DATE_RE.test(week) && mondayOf(week) === week && week <= latest;
}

// 周结算页：默认显示最近一个「完整周」（lastMonday，即已结束的那周），
// ?week=YYYY-MM-DD 回看更早的周。数据始终从 CheckIn 实时重算（结算与行数
// 一一对应、可复现），cron 存的 Setting.weekly_report_* 只作推送历史，本页不读。
// 非法 week（格式错 / 非周一 / 晚于最近完整周）→ 302 回 /weekly 取默认周。
export default async function WeeklyPage(props: PageProps<"/weekly">) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const db = getPrisma();
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
  });
  if (!me) redirect("/login");

  const latest = lastMonday(new Date());
  const sp = await props.searchParams;
  const requested = typeof sp.week === "string" ? sp.week : "";
  if (requested && !isViewableWeek(requested, latest)) redirect("/weekly");
  const weekStart = requested || latest;
  const weekEnd = addDays(weekStart, 6);

  const [users, rows] = await Promise.all([
    db.user.findMany({ select: { id: true, displayName: true }, orderBy: { id: "asc" } }),
    db.checkIn.findMany({
      // date 是北京日期字符串，YYYY-MM-DD 字典序即时间序，直接用 gte/lte
      where: { date: { gte: weekStart, lte: weekEnd } },
      select: { userId: true, date: true, durationMinutes: true, hasPhoto: true, user: { select: { displayName: true } } },
    }),
  ]);

  // computeWeekly 会漏掉区间内零打卡的用户 —— 用全员名册补齐为「缺卡 7 天」
  const computed = computeWeekly(
    rows.map((r) => ({ ...r, displayName: r.user.displayName })),
    weekStart,
  );
  const byId = new Map(computed.map((s) => [s.userId, s]));
  const stats: WeeklyStat[] = users.map(
    (u) =>
      byId.get(u.id) ?? {
        userId: u.id,
        displayName: u.displayName,
        days: 0,
        totalMinutes: 0,
        noProofDays: 0,
        missedDays: 7,
      },
  );
  // 缺卡最多者置顶（并列时按 userId 稳定排序），候选人一眼可见
  stats.sort((a, b) => b.missedDays - a.missedDays || a.userId - b.userId);
  const maxMissed = stats[0]?.missedDays ?? 0;
  // 全员零缺卡时不设候选人：并列第一也得真缺过卡才算数

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const hasNext = nextWeek <= latest;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin={me.isAdmin} />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">周结算</h1>
          <p className="text-xs text-muted-foreground">
            {weekStart} ~ {weekEnd}
          </p>
        </div>
        <LogoutButton />
      </header>

      <nav aria-label="周选择" className="flex items-center justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/weekly?week=${prevWeek}`} rel="prev">
            ← 上一周
          </Link>
        </Button>
        {hasNext ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/weekly?week=${nextWeek}`} rel="next">
              下一周 →
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已是最近一个完整周</span>
        )}
      </nav>

      {stats.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          还没有成员，注册之后这里会按周汇总每个人的打卡。
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">成员周报</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">成员</th>
                  <th className="py-2 pr-2 text-right font-medium">打卡天数</th>
                  <th className="py-2 pr-2 text-right font-medium">总时长(小时)</th>
                  <th className="py-2 pr-2 text-right font-medium">无凭证天数</th>
                  <th className="py-2 text-right font-medium">缺卡天数</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const crown = s.missedDays === maxMissed && maxMissed > 0;
                  return (
                    <tr
                      key={s.userId}
                      className={cn(
                        "border-b last:border-b-0",
                        crown && "bg-amber-100/70 dark:bg-amber-500/10",
                      )}
                    >
                      <td className="py-2.5 pr-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{s.displayName}</span>
                          {crown && (
                            <Badge className="shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                              👑 奶茶候选人
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{s.days}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">
                        {(s.totalMinutes / 60).toFixed(1)}
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{s.noProofDays}</td>
                      <td className="py-2.5 text-right tabular-nums">{s.missedDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
