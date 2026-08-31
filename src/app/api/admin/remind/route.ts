import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { sendReminders } from "@/lib/remind";

// POST /api/admin/remind — 管理员「立即提醒」按钮的落点（session 鉴权）。
// force=1 语义在 lib/remind.ts 里：跳过 remind_hour 小时门，手动触发的
// 意义就是不等点到。之所以单独开这个端点而不是让按钮带 secret 调 cron
// 端点，是因为 secret 一旦传给客户端组件就会被序列化进 RSC payload
//（"use client" 的 props 无一例外），等于发给所有能打开 admin 页的人。
export async function POST() {
  try {
    const me = await requireUser();
    if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const result = await sendReminders(true);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/remind POST]", e);
    return NextResponse.json({ error: "提醒推送失败" }, { status: 500 });
  }
}
