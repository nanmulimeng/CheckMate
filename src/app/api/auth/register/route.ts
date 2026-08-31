import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getSetting } from "@/lib/settings";
import { getSession } from "@/lib/auth";
import { validateRegistration, nextUserIsAdmin, PRESET_SUBJECTS } from "@/lib/registration";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password, inviteCode } = body ?? {};

    // 邀请码来自 Setting.invite_code（seed 预置，管理员可在设置里改）
    const expectedInviteCode = await getSetting("invite_code");
    const error = validateRegistration(username, password, inviteCode, expectedInviteCode);
    if (error) return NextResponse.json({ error: error.error }, { status: error.status });

    const db = getPrisma();
    if (await db.user.findUnique({ where: { username } }))
      return NextResponse.json({ error: "用户名已存在" }, { status: 409 });

    const isAdmin = nextUserIsAdmin(await db.user.count());
    const user = await db.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        displayName: username,
        isAdmin,
        subjects: {
          create: PRESET_SUBJECTS.map((name, i) => ({ name, sortOrder: i })),
        },
      },
    });

    // 注册即登录：前端成功后 router.push("/") 才不会被 / 的登录守卫打回
    const session = await getSession();
    session.userId = user.id; // isAdmin 不进 session：requireUser 每次查库取新鲜值
    await session.save();

    return NextResponse.json({ id: user.id, isAdmin: user.isAdmin });
  } catch (e) {
    console.error("[api/auth/register]", e);
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
