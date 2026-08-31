import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { addDays, beijingDateStr, lastMonday } from "@/lib/dates";
import { getPrisma } from "@/lib/db";
import { sendServerChan } from "@/lib/serverchan";
import { getSetting, setSetting } from "@/lib/settings";
import { computeWeekly, owedDays, type WeeklyStat } from "@/lib/weekly";

// GET /api/cron/weekly?secret=… — 周一 00:10 由 crontab 调用。
// 结算「上个完整周」（lastMonday 起 7 天）：全员逐人推送一行摘要，
// 并把完整结果 JSON 存 Setting.weekly_report_<weekStart>（推送历史/回看，
// /weekly 页面本身始终从 CheckIn 实时重算，不读这份存档）。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const weekStart = lastMonday(new Date());
    const weekEnd = addDays(weekStart, 6);
    const db = getPrisma();
    const [users, rows] = await Promise.all([
      db.user.findMany({
        select: { id: true, displayName: true, serverchanKey: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
      db.checkIn.findMany({
        // date 是北京日期字符串，YYYY-MM-DD 字典序即时间序，直接用 gte/lte
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: { userId: true, date: true, durationMinutes: true, hasPhoto: true, user: { select: { displayName: true } } },
      }),
    ]);
    // 注册日按北京时区折算成日期串（与 CheckIn.date 同一口径）
    const registeredOn = new Map(users.map((u) => [u.id, beijingDateStr(u.createdAt)]));

    // computeWeekly 会漏掉区间内零打卡的用户 —— 用全员名册补齐为「满额缺卡」
    //（缺卡天数同样只算注册之后应打的部分）
    const computed = computeWeekly(
      rows.map((r) => ({ ...r, displayName: r.user.displayName })),
      weekStart,
      registeredOn,
    );
    const byId = new Map(computed.map((s) => [s.userId, s]));
    const report: WeeklyStat[] = users.map(
      (u) =>
        byId.get(u.id) ?? {
          userId: u.id,
          displayName: u.displayName,
          days: 0,
          totalMinutes: 0,
          noProofDays: 0,
          missedDays: owedDays(weekStart, registeredOn.get(u.id)),
        },
    );

    for (const u of users) {
      if (!u.serverchanKey) continue;
      const s = report.find((r) => r.userId === u.id)!;
      // 摘要示例：「打卡 5 天 · 共 12.5 小时 · 无凭证 1 天」
      const summary = `打卡 ${s.days} 天 · 共 ${(s.totalMinutes / 60).toFixed(1)} 小时 · 无凭证 ${s.noProofDays} 天`;
      // sendServerChan 永不抛出，失败只记日志，不影响结算与响应
      await sendServerChan(u.serverchanKey, "上周学习结算", summary);
    }

    await setSetting(`weekly_report_${weekStart}`, JSON.stringify(report));
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("[api/cron/weekly GET]", e);
    return NextResponse.json({ error: "周结算失败" }, { status: 500 });
  }
}
