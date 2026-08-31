import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr } from "@/lib/dates";
import { sendServerChan } from "@/lib/serverchan";
import { Prisma } from "@/generated/prisma/client";

// POST /api/nudge — 催一下 { toUserId } → { ok: true, notified }
// 幂等：Nudge @@unique([from,to,date]) 保证每人每天只能催同一人一次，
// 与动态流「已催过」态共用同一 date 约定（beijingDateStr）。
// 对方未配置 SendKey 时仍创建 Nudge 记录，只是不推送（notified: false）；
// 推送失败也不影响本响应 —— sendServerChan 永不抛出。
export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const toUserId = body?.["toUserId"];

    if (!Number.isInteger(toUserId) || (toUserId as number) <= 0)
      return NextResponse.json({ error: "toUserId 不合法" }, { status: 400 });
    if (toUserId === userId)
      return NextResponse.json({ error: "不能催自己" }, { status: 403 });

    const db = getPrisma();
    const [target, me] = await Promise.all([
      db.user.findUnique({ where: { id: toUserId as number }, select: { serverchanKey: true } }),
      db.user.findUnique({ where: { id: userId }, select: { displayName: true } }),
    ]);
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    try {
      await db.nudge.create({
        data: { fromUserId: userId, toUserId: toUserId as number, date: beijingDateStr(new Date()) },
      });
    } catch (e) {
      // 只认唯一约束冲突（今天已催过），其余异常交给外层兜底
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return NextResponse.json({ error: "今天已经催过啦" }, { status: 409 });
      throw e;
    }

    const notified =
      target.serverchanKey && me
        ? await sendServerChan(
            target.serverchanKey,
            `${me.displayName} 催你学习`,
            "别摆了，打卡走起👉",
          )
        : false;
    return NextResponse.json({ ok: true, notified });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/nudge POST]", e);
    return NextResponse.json({ error: "催一下失败，请稍后再试" }, { status: 500 });
  }
}
