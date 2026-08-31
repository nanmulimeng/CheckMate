import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { canCheckInFor } from "@/lib/dates";
import { validateCheckInPayload } from "@/lib/checkin-validate";

type Ctx = { params: Promise<{ id: string }> };

// 解析路径参数里的打卡 id；非法时返回 400 响应，否则返回数值。
function parseId(raw: string): number | NextResponse {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "打卡 id 不合法" }, { status: 400 });
  return id;
}

async function findOwnCheckIn(id: number, userId: number) {
  const checkIn = await getPrisma().checkIn.findUnique({ where: { id } });
  if (!checkIn || checkIn.userId !== userId) return null;
  return checkIn;
}

// PATCH /api/checkins/[id] — 编辑（仅本人，且打卡日期未过截止）
// body: { subjectId?, durationMinutes?, note? }，任一字段可选。
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const db = getPrisma();
    const checkIn = await findOwnCheckIn(parsed, userId);
    if (!checkIn) return NextResponse.json({ error: "打卡不存在" }, { status: 403 });
    if (!canCheckInFor(checkIn.date, new Date()))
      return NextResponse.json({ error: "该打卡已锁定" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    // 合并后再整体校验：未提供的字段沿用现值，规则与创建时完全一致
    const subjectId = body?.["subjectId"] ?? checkIn.subjectId;
    const durationMinutes = body?.["durationMinutes"] ?? checkIn.durationMinutes;
    const note = body?.["note"] ?? checkIn.note;
    if (!validateCheckInPayload({ subjectId, durationMinutes, note }).ok)
      return NextResponse.json({ error: "科目或时长不合法（时长需为 1-960 分钟，备注 ≤500 字）" }, { status: 400 });

    if (subjectId !== checkIn.subjectId) {
      const subject = await db.subject.findFirst({ where: { id: subjectId as number, userId } });
      if (!subject)
        return NextResponse.json({ error: "科目不存在或不属于你" }, { status: 403 });
    }

    await db.checkIn.update({
      where: { id: parsed },
      data: {
        subjectId: subjectId as number,
        durationMinutes: durationMinutes as number,
        note: typeof note === "string" ? note : "",
      },
    });

    revalidatePath("/");
    return NextResponse.json({ id: parsed });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/checkins PATCH]", e);
    return NextResponse.json({ error: "更新打卡失败，请稍后再试" }, { status: 500 });
  }
}

// DELETE /api/checkins/[id] — 删除（仅本人；照片/评论/点赞由 Prisma 级联删除）
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const checkIn = await findOwnCheckIn(parsed, userId);
    if (!checkIn) return NextResponse.json({ error: "打卡不存在" }, { status: 403 });

    await getPrisma().checkIn.delete({ where: { id: parsed } });

    revalidatePath("/");
    return NextResponse.json({ id: parsed });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/checkins DELETE]", e);
    return NextResponse.json({ error: "删除打卡失败，请稍后再试" }, { status: 500 });
  }
}
