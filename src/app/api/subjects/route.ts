import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";

// 返回当前用户自己的科目（打卡页/设置页共用），按 sortOrder 排序。
export async function GET() {
  try {
    const { id: userId } = await requireUser();
    const subjects = await getPrisma().subject.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
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
