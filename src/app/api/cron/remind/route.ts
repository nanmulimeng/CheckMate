import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { getPrisma } from "@/lib/db";
import { beijingDateStr, beijingHour } from "@/lib/dates";
import { sendServerChan } from "@/lib/serverchan";
import { getSetting } from "@/lib/settings";

// GET /api/cron/remind?secret=… — crontab 每小时整点调用（deploy/crontab.sample），
// 是否真的推送由 Setting.remind_hour 决定（管理员在 /admin 改，即时生效，
// 无需动 crontab）：当前北京时间小时 ≠ 设定小时 → 无副作用空跳。
// ?force=1（管理员「立即提醒」）跳过小时门：手动触发的意义就是不等点到。
// 注意正文是「还有 4 小时」：截止是次日 01:00，21:00 距此 4 小时。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const forced = req.nextUrl.searchParams.get("force") === "1";
    if (!forced) {
      const rawHour = await getSetting("remind_hour");
      const parsed = Number(rawHour);
      // 缺省/非法（含 Number("")===0 的坑）一律回退 21 点
      const remindHour = rawHour !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 21;
      if (beijingHour(new Date()) !== remindHour)
        return NextResponse.json({ skipped: true, reason: "hour" });
    }

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
