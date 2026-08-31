import { redirect } from "next/navigation";
import AdminSettingsForm from "@/components/admin/settings-form";
import RemindNowButton from "@/components/admin/remind-now-button";
import ResetPasswordButton from "@/components/admin/reset-password-button";
import LogoutButton from "@/components/logout-button";
import SiteNav from "@/components/site-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

// 登录守卫：读取 session 必须走动态渲染（与首页同款模式）
export const dynamic = "force-dynamic";

// 注册时间统一北京时间显示（与 dates.ts 同一时区来源）
const BJ_DATETIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtTime = (d: Date) => BJ_DATETIME.format(d).replace(",", "");

// 管理员页：成员列表（含重置密码）+ 全局设置编辑 + 立即提醒。
// 权限从 DB 实时读（不信任 session 快照）：非管理员一律 302 回首页。
export default async function AdminPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const db = getPrisma();
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true },
  });
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/");

  const [members, examDate, remindHour, deadlineHour, inviteCode] = await Promise.all([
    db.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true, username: true, displayName: true, createdAt: true, serverchanKey: true },
    }),
    getSetting("exam_date"),
    getSetting("remind_hour"),
    getSetting("deadline_hour"),
    getSetting("invite_code"),
    // cron_secret 刻意不查：它只该活在服务端（cron 入口的鉴权用），
    // 任何走到客户端的路径都会让它进 RSC payload / HTML。
  ]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">管理</h1>
          <p className="text-xs text-muted-foreground">成员、全局设置与手动提醒</p>
        </div>
        <div className="flex items-center gap-2">
          <RemindNowButton />
          <LogoutButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">成员（{members.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">成员</th>
                <th className="py-2 pr-2 font-medium">注册时间</th>
                <th className="py-2 pr-2 text-center font-medium">推送</th>
                <th className="py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="py-2.5 pr-2">
                    <p className="min-w-0 truncate font-medium">{m.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{m.username}</p>
                  </td>
                  <td className="py-2.5 pr-2 text-xs whitespace-nowrap text-muted-foreground">
                    {fmtTime(m.createdAt)}
                  </td>
                  <td className="py-2.5 pr-2 text-center">{m.serverchanKey ? "✓" : "—"}</td>
                  <td className="py-2.5 text-right">
                    <ResetPasswordButton userId={m.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AdminSettingsForm
        initial={{
          exam_date: examDate,
          remind_hour: remindHour,
          deadline_hour: deadlineHour,
          invite_code: inviteCode,
        }}
      />
    </main>
  );
}
