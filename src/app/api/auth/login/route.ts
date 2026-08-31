import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password)
      return NextResponse.json({ error: "请输入用户名和密码" }, { status: 400 });

    const user = await getPrisma().user.findUnique({ where: { username } });
    // 不区分“用户不存在/密码错误”，避免用户名枚举
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

    const session = await getSession();
    session.userId = user.id;
    session.isAdmin = user.isAdmin;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/auth/login]", e);
    return NextResponse.json({ error: "登录失败，请稍后再试" }, { status: 500 });
  }
}
