import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

// 管理员全局设置（Setting 表）：exam_date / remind_hour / invite_code。
// GET 返回当前三项（仅管理员）；PATCH 校验后写入（仅管理员，403）。
// exam_date 只收真实存在的日期：正则挡格式垃圾（Task 8 评审发现过 NaN 天倒计时），
// 再用「UTC 解析后回绕回原串」挡 2026-02-30 这类格式合法但语义非法的值。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 真实存在的 YYYY-MM-DD（如 2026-02-30 会被 UTC 滚成 03-02 而过不了回绕检查） */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
}

async function readAdminSettings() {
  const [examDate, remindHour, inviteCode] = await Promise.all([
    getSetting("exam_date"),
    getSetting("remind_hour"),
    getSetting("invite_code"),
  ]);
  return { exam_date: examDate, remind_hour: remindHour, invite_code: inviteCode };
}

export async function GET() {
  try {
    const me = await requireUser();
    if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    return NextResponse.json(await readAdminSettings());
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/settings GET]", e);
    return NextResponse.json({ error: "读取设置失败" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
    const updates: { key: string; value: string }[] = [];

    if ("exam_date" in (body ?? {})) {
      const examDate = body!["exam_date"];
      // 允许传空串 = 清除考试日期（首页倒计时随之隐藏）
      if (examDate === "") updates.push({ key: "exam_date", value: "" });
      else if (typeof examDate !== "string" || !isRealDate(examDate))
        return NextResponse.json({ error: "exam_date 需为真实存在的 YYYY-MM-DD 日期" }, { status: 400 });
      else updates.push({ key: "exam_date", value: examDate });
    }

    if ("remind_hour" in (body ?? {})) {
      const hour = body!["remind_hour"];
      if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23)
        return NextResponse.json({ error: "remind_hour 需为 0-23 的整数" }, { status: 400 });
      updates.push({ key: "remind_hour", value: String(hour) });
    }

    if ("invite_code" in (body ?? {})) {
      const code = body!["invite_code"];
      // 空串不允许：邀请码一旦为空，注册会 fail-closed（503），这里从源头挡住误清空
      if (typeof code !== "string" || code.trim() === "")
        return NextResponse.json({ error: "邀请码不能为空" }, { status: 400 });
      updates.push({ key: "invite_code", value: code.trim() });
    }

    if (updates.length === 0)
      return NextResponse.json({ error: "没有要更新的字段" }, { status: 400 });

    for (const { key, value } of updates) await setSetting(key, value);
    // 写完把最新值整体返回，前端不用再补一次 GET
    return NextResponse.json(await readAdminSettings());
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/admin/settings PATCH]", e);
    return NextResponse.json({ error: "保存设置失败" }, { status: 500 });
  }
}
