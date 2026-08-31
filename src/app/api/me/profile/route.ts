import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sendServerChan } from "@/lib/serverchan";

// 个人资料设置：
//   PATCH { displayName?, serverchanKey?, password?, oldPassword? }
//   POST  { test: true } — 用自己配置的 SendKey 发一条测试推送
// displayName：1-20 字（trim 后）；serverchanKey：空串 = 清除，非空 = 保存；
// password：需带 oldPassword 且通过校验（403），新密码 ≥8 位（400）。

const DISPLAY_NAME_MAX = 20;
const SENDKEY_MAX = 128;

export async function PATCH(req: NextRequest) {
  try {
    const { id: userId } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;

    const db = getPrisma();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 401 });

    const data: { displayName?: string; serverchanKey?: string | null; passwordHash?: string } = {};

    // 三个字段都只在「body 里出现了这个 key」时才处理，未出现保持原值
    if ("displayName" in (body ?? {})) {
      const name = body!["displayName"];
      if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > DISPLAY_NAME_MAX)
        return NextResponse.json({ error: `昵称需为 1-${DISPLAY_NAME_MAX} 个字符` }, { status: 400 });
      data.displayName = name.trim();
    }

    if ("serverchanKey" in (body ?? {})) {
      const key = body!["serverchanKey"];
      if (typeof key !== "string" || key.length > SENDKEY_MAX)
        return NextResponse.json({ error: `SendKey 不合法（≤${SENDKEY_MAX} 字符，留空表示清除）` }, { status: 400 });
      data.serverchanKey = key === "" ? null : key; // 空串 = 清除
    }

    if ("password" in (body ?? {})) {
      const newPassword = body!["password"];
      const oldPassword = body!["oldPassword"];
      if (typeof newPassword !== "string" || newPassword.length < 8)
        return NextResponse.json({ error: "新密码至少 8 位" }, { status: 400 });
      // 改密必须验旧密码（bcrypt 比对；错 = 403 而非 400，语义是「无权改」）
      if (typeof oldPassword !== "string" || !(await verifyPassword(oldPassword, user.passwordHash)))
        return NextResponse.json({ error: "旧密码不正确" }, { status: 403 });
      data.passwordHash = await hashPassword(newPassword);
    }

    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "没有要更新的字段" }, { status: 400 });

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: { displayName: true, serverchanKey: true },
    });
    return NextResponse.json({ ok: true, displayName: updated.displayName, hasKey: !!updated.serverchanKey });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/me/profile PATCH]", e);
    return NextResponse.json({ error: "保存失败，请稍后再试" }, { status: 500 });
  }
}

// 测试推送：给「自己已保存的 SendKey」发一条。没配 key 或推送失败都返回 200
// + sent:false（sendServerChan 永不抛出），由前端把结果亮出来。
export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    if (body?.["test"] !== true)
      return NextResponse.json({ error: "只支持 { test: true }" }, { status: 400 });

    const user = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { serverchanKey: true },
    });
    if (!user?.serverchanKey) return NextResponse.json({ sent: false, reason: "未配置 SendKey" });

    const sent = await sendServerChan(user.serverchanKey, "测试推送", "Server酱配置成功");
    return NextResponse.json({ sent });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/me/profile POST]", e);
    return NextResponse.json({ error: "测试推送失败" }, { status: 500 });
  }
}
