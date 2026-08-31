import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import PasswordSection from "@/components/settings/password-section";
import ProfileSection from "@/components/settings/profile-section";
import SubjectManager from "@/components/settings/subject-manager";
import SiteNav from "@/components/site-nav";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// 登录守卫：读取 session 必须走动态渲染（与首页同款模式）
export const dynamic = "force-dynamic";

// 个人设置页：昵称 / SendKey（测试推送）/ 科目管理 / 修改密码。
// 服务端壳只取数并传给三个客户端小岛（沿用 checkin/new 的「服务端壳 + 客户端表单」模式）。
export default async function SettingsPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const db = getPrisma();
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isAdmin: true, displayName: true, serverchanKey: true },
  });
  if (!me) redirect("/login");

  // _count.checkins 决定删除按钮是否禁用（有历史打卡 → 只能改名）
  const subjects = await db.subject.findMany({
    where: { userId: me.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, _count: { select: { checkins: true } } },
  });

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-6">
      <SiteNav isAdmin={me.isAdmin} />
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">设置</h1>
          <p className="text-xs text-muted-foreground">昵称、推送、科目与密码</p>
        </div>
        <LogoutButton />
      </header>

      <ProfileSection initialDisplayName={me.displayName} initialHasKey={!!me.serverchanKey} />
      <SubjectManager
        initialSubjects={subjects.map((s) => ({
          id: s.id,
          name: s.name,
          hasHistory: s._count.checkins > 0,
        }))}
      />
      <PasswordSection />
    </main>
  );
}
