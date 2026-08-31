import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

const CONTENT_MAX = 200;

// POST /api/checkins/[id]/comments — 评论打卡（登录成员均可评）
// body: { content }，trim 后 1-200 字；打卡不存在 → 404。
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const content = typeof body?.["content"] === "string" ? body["content"].trim() : "";
    if (content.length < 1 || content.length > CONTENT_MAX)
      return NextResponse.json({ error: "评论需为 1-200 字" }, { status: 400 });

    const db = getPrisma();
    const checkIn = await db.checkIn.findUnique({ where: { id: parsed }, select: { id: true } });
    if (!checkIn) return NextResponse.json({ error: "打卡不存在" }, { status: 404 });

    const comment = await db.comment.create({ data: { checkInId: parsed, userId, content } });

    revalidatePath("/");
    return NextResponse.json({ id: comment.id });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/checkins/[id]/comments POST]", e);
    return NextResponse.json({ error: "评论失败，请稍后再试" }, { status: 500 });
  }
}
