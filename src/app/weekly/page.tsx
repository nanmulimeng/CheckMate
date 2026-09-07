import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, Check, CupSoda, Flame, Sparkles, Star, TrendingUp } from "lucide-react";
import LogoutButton from "@/components/logout-button";
import SiteNav from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { addDays, beijingDateStr, lastMonday, mondayOf } from "@/lib/dates";
import { getPrisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { computeWeekly, owedDays, weeklyBadges, weekStrip, type WeeklyStat } from "@/lib/weekly";

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
// （User.weeklyGoalDays，各自在设置页改），没完成自己保底的才是奶茶候选人；
// 不做成员间排名（固定注册顺序），正向徽章（达标/全勤/连续/进步）替代公开挂人。
// 成员行用 7 格周条可视化：点亮=打卡、相机角标=当天有照片、虚线格=超出保底的加成区。
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

  // 徽章按「自己的保底」算：达标 / 全勤 / 连续达标 / 较上周进步
  const badges = new Map(
    users.map((u) => [
      u.id,
      weeklyBadges(u.id, allRows, weekStart, u.weeklyGoalDays, registeredOn.get(u.id)),
    ]),
  );
  const goals = new Map(users.map((u) => [u.id, u.weeklyGoalDays]));
  // 每人 7 格周条（窗口过滤在 weekStrip 内部完成）
  const strips = new Map(
    users.map((u) => [
      u.id,
      weekStrip(
        weekStart,
        u.weeklyGoalDays,
        allRows.filter((r) => r.userId === u.id).map((r) => ({ date: r.date, hasPhoto: r.hasPhoto })),
      ),
    ]),
  );

  // 全组汇总：叙事是「我们这周一起」，不是「谁落后了」
  const totalDays = stats.reduce((a, s) => a + s.days, 0);
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
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                这周大家
                {allGoalMet && (
                  <Sparkles className="size-4 fill-amber-300 text-amber-500" aria-label="全员达标" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                合计打卡 <span className="tabular-nums font-medium">{totalDays}</span> 天 ·
                共学 <span className="tabular-nums font-medium">{totalHours.toFixed(1)}</span> 小时
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  达标 {goalMetCount}/{users.length} 人
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-amber-300 text-amber-500" aria-hidden />
                  全勤 {fullCount} 人
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">成员周报</CardTitle>
            </CardHeader>
            <CardContent>
              <ul>
                {stats.map((s) => {
                  const b = badges.get(s.userId)!;
                  const strip = strips.get(s.userId)!;
                  return (
                    <li key={s.userId} className="border-b py-3 last:border-b-0 last:pb-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{s.displayName}</span>
                          {!b.goalMet && (
                            <Badge className="shrink-0 gap-1 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300">
                              <CupSoda className="size-3" aria-hidden />
                              奶茶候选人
                            </Badge>
                          )}
                          {b.full && (
                            <Star
                              className="size-3.5 shrink-0 fill-amber-300 text-amber-500"
                              aria-label="本周全勤"
                            />
                          )}
                          {b.streak >= 2 && (
                            <span
                              title={`连续 ${b.streak} 周达到自己的保底`}
                              className="inline-flex shrink-0 items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400"
                            >
                              <Flame className="size-3.5" aria-hidden />
                              {b.streak}
                            </span>
                          )}
                          {b.improved && (
                            <TrendingUp
                              className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400"
                              aria-label="打卡天数比上周多"
                            />
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-sm">
                          {s.days}/{goals.get(s.userId)}
                          {b.goalMet && (
                            <Check
                              className="ml-0.5 inline size-3.5 align-[-2px] text-emerald-600 dark:text-emerald-400"
                              aria-label="达到保底"
                            />
                          )}
                        </span>
                      </div>
                      <div
                        className="mt-2 flex items-end gap-1.5"
                        role="img"
                        aria-label={`周条：${s.days}/${goals.get(s.userId)} 天，有相机的天表示有照片凭证`}
                      >
                        {strip.map((c) => (
                          <div key={c.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                            <div
                              className={cn(
                                "h-2.5 w-full rounded-full",
                                c.checked
                                  ? "bg-emerald-500"
                                  : c.beyondGoal
                                    ? "border border-dashed border-border"
                                    : "bg-muted-foreground/25",
                              )}
                            />
                            {c.hasPhoto ? (
                              <Camera
                                className="size-3 text-muted-foreground"
                                aria-label={`${c.date} 有照片凭证`}
                              />
                            ) : (
                              <span className="text-[10px] leading-none text-muted-foreground">
                                {c.label}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        共学 {(s.totalMinutes / 60).toFixed(1)} 小时
                        {s.noProofDays > 0 && <> · 无凭证 {s.noProofDays} 天</>}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  达到自己的保底
                </span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-amber-300 text-amber-500" aria-hidden />
                  全勤
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flame className="size-3.5 text-orange-600 dark:text-orange-400" aria-hidden />
                  连续 N 周达标
                </span>
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="size-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
                  比上周多
                </span>
                <span className="inline-flex items-center gap-1">
                  <Camera className="size-3.5" aria-hidden />
                  当天有照片
                </span>
                <span className="inline-flex items-center gap-1">
                  <CupSoda className="size-3.5" aria-hidden />
                  未完成自己的保底
                </span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                保底在设置页改，按自己的节奏定；虚线格是保底之外的加成区。
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
