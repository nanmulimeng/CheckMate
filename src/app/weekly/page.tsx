import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import SiteNav from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { addDays, beijingDateStr, lastMonday, mondayOf } from "@/lib/dates";
import { getPrisma } from "@/lib/db";
import { computeWeekly, owedDays, weeklyBadges, type WeeklyStat } from "@/lib/weekly";

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
//
// 呈现原则：只和自己比、不和别人比——奖惩基准是「自己的每周保底天数」
// （User.weeklyGoalDays，各自在设置页改），没完成自己保底的才是 🧋 奶茶候选人；
// 不做成员间排名（固定注册顺序），正向徽章（达标/全勤/连续/进步）替代公开挂人。
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

  const [users, allRows] = await Promise.all([
    db.user.findMany({
      select: { id: true, displayName: true, createdAt: true, weeklyGoalDays: true },
      orderBy: { id: "asc" },
    }),
    db.checkIn.findMany({
      // 查全历史（≤ weekEnd）而非只查本周：徽章的「连续达标周数 / 较上周进步」
      // 要往前翻周。computeWeekly 内部按周窗口过滤，本周数字不受全量影响。
      // date 是北京日期字符串，YYYY-MM-DD 字典序即时间序，直接 lte
      where: { date: { lte: weekEnd } },
      select: { userId: true, date: true, durationMinutes: true, hasPhoto: true, user: { select: { displayName: true } } },
    }),
  ]);
  // 注册日按北京时区折算成日期串（与 CheckIn.date 同一口径）
  const registeredOn = new Map(users.map((u) => [u.id, beijingDateStr(u.createdAt)]));

  // computeWeekly 会漏掉区间内零打卡的用户 —— 用全员名册补齐为「满额缺卡」
  //（缺卡天数同样只算注册之后应打的部分）
  const computed = computeWeekly(
    allRows.map((r) => ({ ...r, displayName: r.user.displayName })),
    weekStart,
    registeredOn,
  );
  const byId = new Map(computed.map((s) => [s.userId, s]));
  // 固定成员顺序（注册序），不做相互排名
  const stats: WeeklyStat[] = users.map(
    (u) =>
      byId.get(u.id) ?? {
        userId: u.id,
        displayName: u.displayName,
        days: 0,
        totalMinutes: 0,
        noProofDays: 0,
        missedDays: owedDays(weekStart, registeredOn.get(u.id)),
      },
  );

  // 徽章按「自己的保底」算：达标 ✅ / 全勤 🌟 / 连续达标 🔥 / 较上周进步 📈
  const badges = new Map(
    users.map((u) => [
      u.id,
      weeklyBadges(u.id, allRows, weekStart, u.weeklyGoalDays, registeredOn.get(u.id)),
    ]),
  );
  const goals = new Map(users.map((u) => [u.id, u.weeklyGoalDays]));

  // 全组汇总：叙事是「我们这周一起」，不是「谁落后了」
  const totalDays = stats.reduce((a, s) => a + s.days, 0);
  const totalOwed = stats.reduce((a, s) => a + s.days + s.missedDays, 0); // owed = days + missed
  const totalHours = stats.reduce((a, s) => a + s.totalMinutes, 0) / 60;
  const goalMetCount = users.filter((u) => badges.get(u.id)?.goalMet).length;
  const fullCount = users.filter((u) => badges.get(u.id)?.full).length;
  const allGoalMet = users.length > 0 && goalMetCount === users.length;

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
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">这周大家 {allGoalMet && "🎉"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                打卡 <span className="tabular-nums font-medium">{totalDays}/{totalOwed}</span> 人日 ·
                共学 <span className="tabular-nums font-medium">{totalHours.toFixed(1)}</span> 小时
              </p>
              <p className="text-muted-foreground">
                ✅ 达标 {goalMetCount}/{users.length} 人 · 🌟 全勤 {fullCount} 人
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">成员周报（只和自己比）</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">成员</th>
                    <th className="py-2 pr-2 text-right font-medium whitespace-nowrap">打卡/保底</th>
                    <th className="py-2 pr-2 text-right font-medium whitespace-nowrap">时长(小时)</th>
                    <th className="py-2 pr-2 text-right font-medium whitespace-nowrap">无凭证</th>
                    <th className="py-2 text-right font-medium whitespace-nowrap">缺卡</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => {
                    const b = badges.get(s.userId)!;
                    return (
                      <tr key={s.userId} className="border-b last:border-b-0">
                        <td className="py-2.5 pr-2">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium">{s.displayName}</span>
                            {!b.goalMet && (
                              <Badge className="shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                                🧋 奶茶候选人
                              </Badge>
                            )}
                            {b.full && (
                              <span title="本周全勤" className="shrink-0">
                                🌟
                              </span>
                            )}
                            {b.streak >= 2 && (
                              <span title={`连续 ${b.streak} 周达到自己的保底`} className="shrink-0 text-xs">
                                🔥{b.streak}
                              </span>
                            )}
                            {b.improved && (
                              <span title="打卡天数比上周多" className="shrink-0">
                                📈
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums">
                          {s.days}/{goals.get(s.userId)}
                          {b.goalMet ? " ✅" : ""}
                        </td>
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
              <p className="mt-3 text-xs text-muted-foreground">
                ✅ 达到自己的保底 · 🌟 全勤 · 🔥 连续 N 周达标 · 📈 比上周多 · 🧋
                未完成自己的保底（保底在设置页改，按自己的节奏定）
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
