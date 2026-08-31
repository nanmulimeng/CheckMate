import Link from "next/link";
import { redirect } from "next/navigation";
import Heatmap from "@/components/heatmap";
import LogoutButton from "@/components/logout-button";
import SubjectStats from "@/components/subject-stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getMeStats, HEATMAP_WEEKS } from "@/lib/me-stats";

// 登录守卫：读取 session 必须走动态渲染（与首页同款模式）
export const dynamic = "force-dynamic";

// 个人页：当前 streak + 累计值（全部历史）+ 近 26 周热力图 + 按科目时长。
// 全部聚合在服务端 lib 完成，组件只消费字符串与数字。
export default async function MePage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const me = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  if (!me) redirect("/login");

  const stats = await getMeStats(me.id);
  const totalHours = (stats.totalMinutes / 60).toFixed(1);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">我的统计</h1>
          <p className="text-xs text-muted-foreground">
            热力图近 {HEATMAP_WEEKS} 周 · {stats.today}（北京时间）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/">今日动态</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/checkin/new">记一笔</Link>
          </Button>
          <LogoutButton />
        </div>
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
    </main>
  );
}
