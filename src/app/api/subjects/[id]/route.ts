import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// /api/subjects/[id] — 改名/排序（PATCH）与删除（DELETE），只能操作自己的科目。
// 删除保护：有历史打卡的科目不可删（409 引导改名），否则统计口径会被破坏。

type Ctx = { params: Promise<{ id: string }> };

const NAME_MAX = 20;

function normalizeSubjectName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

// 解析路径参数里的科目 id；非法返回 400 响应，否则返回数值。
function parseId(raw: string): number | NextResponse {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "科目 id 不合法" }, { status: 400 });
  return id;
}

async function findOwnSubject(id: number, userId: number) {
  const subject = await getPrisma().subject.findUnique({ where: { id } });
  // 别人的科目与不存在的科目同样报 404，不泄露存在性
  if (!subject || subject.userId !== userId) return null;
  return subject;
}

// PATCH { name?, sortOrder? } — 任选其一；name 同样受唯一性约束（409）。
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const db = getPrisma();
    const subject = await findOwnSubject(parsed, userId);
    if (!subject) return NextResponse.json({ error: "科目不存在" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const data: { name?: string; sortOrder?: number } = {};

    if ("name" in (body ?? {})) {
      const name = normalizeSubjectName(body!["name"]);
      if (!name)
        return NextResponse.json({ error: `科目名需为 1-${NAME_MAX} 个字符` }, { status: 400 });
      if (name !== subject.name && (await db.subject.findFirst({ where: { userId, name } })))
        return NextResponse.json({ error: "科目名已存在" }, { status: 409 });
      data.name = name;
    }

    if ("sortOrder" in (body ?? {})) {
      const sortOrder = body!["sortOrder"];
      if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder))
        return NextResponse.json({ error: "sortOrder 需为整数" }, { status: 400 });
      data.sortOrder = sortOrder;
    }

    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "没有要更新的字段" }, { status: 400 });

    const updated = await db.subject.update({
      where: { id: parsed },
      data,
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ subject: updated });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/subjects/[id] PATCH]", e);
    return NextResponse.json({ error: "更新科目失败" }, { status: 500 });
  }
}

// DELETE — 有历史打卡 → 409「可改名」；无历史才真删。
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id: userId } = await requireUser();
    const parsed = parseId((await ctx.params).id);
    if (parsed instanceof NextResponse) return parsed;

    const db = getPrisma();
    const subject = await findOwnSubject(parsed, userId);
    if (!subject) return NextResponse.json({ error: "科目不存在" }, { status: 404 });

    const checkinCount = await db.checkIn.count({ where: { subjectId: parsed } });
    if (checkinCount > 0)
      return NextResponse.json({ error: "该科目有历史打卡，不能删除（可改名）" }, { status: 409 });

    await db.subject.delete({ where: { id: parsed } });
    return NextResponse.json({ id: parsed });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/subjects/[id] DELETE]", e);
    return NextResponse.json({ error: "删除科目失败" }, { status: 500 });
  }
}
