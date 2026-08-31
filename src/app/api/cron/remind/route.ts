import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr } from "@/lib/dates";
import { sendServerChan } from "@/lib/serverchan";
import { getSetting } from "@/lib/settings";

// GET /api/cron/remind?secret=… — 21:00 由 crontab 调用（deploy/crontab.sample）。
// 给「今天（北京时间）还没打卡且配置了 SendKey」的用户推送提醒。
// 也接受 ?force=1 供管理员手动触发：当前行为与定时触发完全一致
// （仍只提醒未打卡者，不额外打扰已打卡的人），参数先收下不生效。
// 注意正文是「还有 4 小时」：截止是次日 01:00，21:00 距此 4 小时。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const date = beijingDateStr(new Date());
    const db = getPrisma();
    const [checkedIn, users] = await Promise.all([
      db.checkIn.findMany({ where: { date }, select: { userId: true } }),
      db.user.findMany({ select: { id: true, serverchanKey: true } }),
    ]);
    const done = new Set(checkedIn.map((c) => c.userId));

    let sent = 0;
    for (const u of users) {
      if (done.has(u.id) || !u.serverchanKey) continue;
      // sendServerChan 永不抛出：sent 只计实际推送成功的条数
      if (await sendServerChan(u.serverchanKey, "今天还没打卡", "距离截止还有 4 小时")) sent++;
    }
    return NextResponse.json({ sent });
  } catch (e) {
    console.error("[api/cron/remind GET]", e);
    return NextResponse.json({ error: "提醒推送失败" }, { status: 500 });
  }
}
