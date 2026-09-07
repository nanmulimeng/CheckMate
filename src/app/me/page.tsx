import { redirect } from "next/navigation";
import { CalendarDays, Camera, Clock, Flame, Star, TrendingUp, type LucideIcon } from "lucide-react";
import Heatmap from "@/components/heatmap";
import LogoutButton from "@/components/logout-button";
import SiteNav from "@/components/site-nav";
import SubjectStats from "@/components/subject-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getMeStats, HEATMAP_WEEKS } from "@/lib/me-stats";
import type { AchievementIcon } from "@/lib/achievements";
import { cn } from "@/lib/utils";

// 登录守卫：读取 session 必须走动态渲染（与首页同款模式）
export const dynamic = "force-dynamic";

// 个人页：当前 streak + 累计值（全部历史）+ 近 26 周热力图 + 按科目时长 + 成就墙。
// 全部聚合在服务端 lib 完成，组件只消费字符串与数字。

const ACHIEVEMENT_ICONS: Record<AchievementIcon, LucideIcon> = {
  clock: Clock,
  calendar: CalendarDays,
  flame: Flame,
  star: Star,
  camera: Camera,
  trending: TrendingUp,
};

export default async function MePage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const me = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
  });
  if (!me) redirect("/login");

  const stats = await getMeStats(me.id);
  const totalHours = (stats.totalMinutes / 60).toFixed(1);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin={me.isAdmin} />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">我的统计</h1>
          <p className="text-xs text-muted-foreground">
            热力图近 {HEATMAP_WEEKS} 周 · {stats.today}（北京时间）
          </p>
        </div>
        <LogoutButton />
      </header>

      <section aria-label="累计统计" className="grid grid-cols-3 gap-2">
        {[
          { label: "连续打卡", value: `${stats.streak}`, unit: "天" },
          { label: "累计打卡", value: `${stats.totalDays}`, unit: "天" },
          { label: "累计时长", value: totalHours, unit: "小时" },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-card px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="text-xl font-semibold tabular-nums">
              {tile.value}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">{tile.unit}</span>
            </p>
          </div>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">近 {HEATMAP_WEEKS} 周热力图</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap records={stats.heatRecords} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">按科目时长</CardTitle>
        </CardHeader>
        <CardContent>
          <SubjectStats bars={stats.subjects} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            成就墙
            <span className="ml-1 text-muted-foreground">
              {stats.achievements.filter((a) => a.unlocked).length}/{stats.achievements.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {stats.achievements.map((a) => {
            const Icon = ACHIEVEMENT_ICONS[a.icon];
            return (
              <div
                key={a.key}
                title={a.detail}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center",
                  a.unlocked
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    : "border-dashed opacity-55",
                )}
              >
                <Icon
                  className={cn(
                    "size-5",
                    a.unlocked
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <p className="text-xs font-medium leading-tight">{a.title}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">{a.detail}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
