import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// POST /api/admin/reset-password { userId } — 管理员重置任意成员（含自己）的密码。
// 生成 8 位一次性临时码：只在本次响应里返回一次，库里只落 bcrypt 哈希，
// 永不存明文。管理员口头转告，成员登录后自行去 /settings 改密。

// 去掉易混淆字符（I/L/O/0/1）的可读字符集，方便口头转告
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function tempPassword(): string {
  return Array.from({ length: 8 }, () => CHARSET[crypto.randomInt(CHARSET.length)]).join("");
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const userId = body?.["userId"];
    if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0)
      return NextResponse.json({ error: "userId 不合法" }, { status: 400 });

    const db = getPrisma();
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const code = tempPassword();
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(code) } });

    return NextResponse.json({
      tempPassword: code,
      hint: "请口头转告，成员登录后应尽快自行修改密码",
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/reset-password POST]", e);
    return NextResponse.json({ error: "重置密码失败" }, { status: 500 });
  }
}
