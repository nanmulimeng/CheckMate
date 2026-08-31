import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendReminders } from "@/lib/remind";
import { getSetting } from "@/lib/settings";

// GET /api/cron/remind?secret=… — crontab 每小时整点调用（deploy/crontab.sample），
// 是否真的推送由 Setting.remind_hour 决定（管理员在 /admin 改，即时生效，
// 无需动 crontab）：当前北京时间小时 ≠ 设定小时 → 无副作用空跳。
// 推送逻辑本体在 src/lib/remind.ts（与 /api/admin/remind 共用）。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const forced = req.nextUrl.searchParams.get("force") === "1";
    return NextResponse.json(await sendReminders(forced));
  } catch (e) {
    console.error("[api/cron/remind GET]", e);
    return NextResponse.json({ error: "提醒推送失败" }, { status: 500 });
  }
}
