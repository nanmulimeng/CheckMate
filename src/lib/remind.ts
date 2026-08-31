import { getPrisma } from "./db";
import { beijingDateStr, beijingHour } from "./dates";
import { sendServerChan } from "./serverchan";
import { getSetting } from "./settings";

// 催学提醒的核心逻辑，供两个入口共用：
//   /api/cron/remind（crontab 每小时整点，secret 鉴权）
//   /api/admin/remind（管理员「立即提醒」按钮，session 鉴权）
// 抽出来是为了让 cron_secret 只存在于服务端进程内 —— 任何客户端组件
// 都拿不到它（曾作为 prop 传进 "use client" 组件而序列化进 RSC payload，
// 2026-09-01 修复）。
export async function sendReminders(force: boolean): Promise<
  { sent: number } | { skipped: true; reason: "hour" }
> {
  if (!force) {
    const rawHour = await getSetting("remind_hour");
    const parsed = Number(rawHour);
    // 缺省/非法（含 Number("")===0 的坑）一律回退 21 点
    const remindHour = rawHour !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 21;
    if (beijingHour(new Date()) !== remindHour)
      return { skipped: true, reason: "hour" };
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
  return { sent };
}
