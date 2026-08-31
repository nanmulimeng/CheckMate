import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// 解析路径参数里的打卡 id；非法时返回 400 响应，否则返回数值。
function parseId(raw: string): number | NextResponse {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "打卡 id 不合法" }, { status: 400 });
  return id;
}

// POST /api/checkins/[id]/likes — 切换点赞（已赞则取消），返回 { liked, count }
// 点赞态由本响应驱动客户端局部更新，页面本身 force-dynamic，无需 revalidate。
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const db = getPrisma();
    const checkIn = await db.checkIn.findUnique({ where: { id: parsed }, select: { id: true } });
    if (!checkIn) return NextResponse.json({ error: "打卡不存在" }, { status: 404 });

    const existing = await db.like.findUnique({
      where: { checkInId_userId: { checkInId: parsed, userId } },
    });
    if (existing)
      await db.like.delete({ where: { checkInId_userId: { checkInId: parsed, userId } } });
    else {
      try {
        await db.like.create({ data: { checkInId: parsed, userId } });
      } catch (e) {
        // 并发双击：另一个请求已抢先创建，撞唯一约束——视为已点赞而非 500
        if ((e as { code?: string }).code !== "P2002") throw e;
      }
    }

    const count = await db.like.count({ where: { checkInId: parsed } });
    return NextResponse.json({ liked: !existing, count });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/checkins/[id]/likes POST]", e);
    return NextResponse.json({ error: "点赞失败，请稍后再试" }, { status: 500 });
  }
}
