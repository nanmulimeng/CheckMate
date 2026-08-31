import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

const NAME_MAX = 20;

// 校验科目名：string、trim 后 1-20 字。合法返回 trim 结果，否则 null。
// （[id] 路由同款局部实现——route.ts 不允许导出 GET/POST 之外的成员）
function normalizeSubjectName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

// 返回当前用户自己的科目（打卡页/设置页共用），按 sortOrder 排序。
export async function GET() {
  try {
    const { id: userId } = await requireUser();
    const subjects = await getPrisma().subject.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ subjects });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/subjects GET]", e);
    return NextResponse.json({ error: "获取科目失败" }, { status: 500 });
  }
}

// POST { name } 新增科目：每人科目名唯一（409），sortOrder 排到队尾。
export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const name = normalizeSubjectName(body?.["name"]);
    if (!name)
      return NextResponse.json({ error: `科目名需为 1-${NAME_MAX} 个字符` }, { status: 400 });

    const db = getPrisma();
    if (await db.subject.findFirst({ where: { userId, name } }))
      return NextResponse.json({ error: "科目名已存在" }, { status: 409 });

    const last = await db.subject.findFirst({
      where: { userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const subject = await db.subject.create({
      data: { userId, name, sortOrder: (last?.sortOrder ?? -1) + 1 },
      select: { id: true, name: true, sortOrder: true },
    });
    return NextResponse.json({ subject }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/subjects POST]", e);
    return NextResponse.json({ error: "新增科目失败" }, { status: 500 });
  }
}
