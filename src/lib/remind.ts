import { getPrisma } from "./db";
import { beijingDateStr, beijingHour, deadlineOf } from "./dates";
import { sendServerChan } from "./serverchan";
import { getDeadlineHour, getSetting } from "./settings";

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
    // 缺省/非法（含 Number("")===0 的坑）一律回退 22 点
    const remindHour = rawHour !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 22;
    if (beijingHour(new Date()) !== remindHour)
      return { skipped: true, reason: "hour" };
  }

  const date = beijingDateStr(new Date());
  const db = getPrisma();
  const [checkedIn, users, deadlineHour] = await Promise.all([
    db.checkIn.findMany({ where: { date }, select: { userId: true } }),
    db.user.findMany({ select: { id: true, serverchanKey: true } }),
    getDeadlineHour(),
  ]);
  const done = new Set(checkedIn.map((c) => c.userId));
  // 剩余时长随 remind_hour/deadline_hour 配置浮动（如 22 点提醒 + 1 点截止 = 3 小时），
  // 不再写死，免得管理员改了时间文案就说谎
  const hoursLeft = Math.round((deadlineOf(date, deadlineHour).getTime() - Date.now()) / 3_600_000);
  const detail = hoursLeft > 0 ? `距离截止还有 ${hoursLeft} 小时` : "打卡截止临近，抓紧补上";

  let sent = 0;
  for (const u of users) {
    if (done.has(u.id) || !u.serverchanKey) continue;
    // sendServerChan 永不抛出：sent 只计实际推送成功的条数
    if (await sendServerChan(u.serverchanKey, "今天还没打卡", detail)) sent++;
  }
  return { sent };
}
