import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import LogoutButton from "@/components/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// 登录守卫：读取 session 必须走动态渲染
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const user = await getPrisma().user.findUnique({
    where: { id: session.userId },
    select: { displayName: true, isAdmin: true },
  });
  if (!user) redirect("/login");

  // 占位首页：学习打卡看板在后续任务实现
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">你好，{user.displayName}</CardTitle>
          <CardDescription>
            {user.isAdmin ? "你是管理员，可以管理邀请码与用户。" : "学习打卡看板即将上线。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {user.isAdmin && (
            <Button variant="secondary" disabled>
              管理后台（待实现）
            </Button>
          )}
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}
