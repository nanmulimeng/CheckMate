import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { addDays, beijingDateStr, lastMonday } from "@/lib/dates";
import { getPrisma } from "@/lib/db";
import { sendServerChan } from "@/lib/serverchan";
import { getSetting, setSetting } from "@/lib/settings";
import { computeWeekly, owedDays, weeklyBadges, type WeeklyStat } from "@/lib/weekly";

// GET /api/cron/weekly?secret=… — 周一 09:07 由 crontab 调用（补卡窗口 01:00
// 关闭后不立即跑，凌晨推送吵醒人；早上跑数据一样完整）。
// 结算「上个完整周」（lastMonday 起 7 天）：全员逐人推送一行摘要，
// 并把完整结果 JSON 存 Setting.weekly_report_<weekStart>（推送历史/回看，
// /weekly 页面本身始终从 CheckIn 实时重算，不读这份存档）。
// 文案口径与页面一致：只和自己比——按自己的保底说达标与否，附一行全组汇总；
// 不再报「无凭证 X 天」（页面可看，推送保持温和，不做负面清单）。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const weekStart = lastMonday(new Date());
    const weekEnd = addDays(weekStart, 6);
    const db = getPrisma();
    const [users, allRows, weeklyNotes] = await Promise.all([
      db.user.findMany({
        select: { id: true, displayName: true, serverchanKey: true, createdAt: true, weeklyGoalDays: true },
        orderBy: { id: "asc" },
      }),
      db.checkIn.findMany({
        // 全历史（≤ weekEnd）：徽章的连续达标/较上周对比要往前翻周；
        // computeWeekly 内部按周窗口过滤，本周数字不受全量影响
        where: { date: { lte: weekEnd } },
        select: { userId: true, date: true, durationMinutes: true, hasPhoto: true, user: { select: { displayName: true } } },
      }),
      db.weeklyNote.findMany({ where: { weekStart }, select: { userId: true, content: true } }),
    ]);
    const noteByUser = new Map(weeklyNotes.map((n) => [n.userId, n.content]));
    // 注册日按北京时区折算成日期串（与 CheckIn.date 同一口径）
    const registeredOn = new Map(users.map((u) => [u.id, beijingDateStr(u.createdAt)]));

    // computeWeekly 会漏掉区间内零打卡的用户 —— 用全员名册补齐为「满额缺卡」
    //（缺卡天数同样只算注册之后应打的部分）
    const computed = computeWeekly(
      allRows.map((r) => ({ ...r, displayName: r.user.displayName })),
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

    // 全组汇总行（人人推送里都带：叙事是「我们这周一起」）
    const goalDays = new Map(users.map((u) => [u.id, u.weeklyGoalDays]));
    const badges = new Map(
      users.map((u) => [
        u.id,
        weeklyBadges(u.id, allRows, weekStart, u.weeklyGoalDays, registeredOn.get(u.id)),
      ]),
    );
    const totalDays = report.reduce((a, r) => a + r.days, 0);
    const groupLine = `全组这周合计打卡 ${totalDays} 天，继续一起走`;

    for (const u of users) {
      if (!u.serverchanKey) continue;
      // 结算周之后才注册的成员：上周对 TA 还不存在，不推结算
      // （否则收到「0/6 差 6 天（奶茶候选人）」的冤枉账）
      const owed = owedDays(weekStart, registeredOn.get(u.id));
      if (owed === 0) continue;
      const s = report.find((r) => r.userId === u.id)!;
      const b = badges.get(u.id)!;
      // 逐人文案示例（只和自己比，正向先行；纯文字，微信端各机型渲染一致）：
      //   达标：「本周打卡 6/6 天，达到保底 · 共 12.5 小时 · 比上周多 · 全组这周…」
      //   未达：「本周打卡 4/6 天，差 2 天（奶茶候选人） · 共 8 小时 · 全组这周…」
      // 达标线按应付天数折算（周中注册只算注册后的天），与页面同口径
      const goal = Math.min(goalDays.get(u.id)!, owed);
      const mine = b.goalMet
        ? `本周打卡 ${s.days}/${goal} 天，达到保底`
        : `本周打卡 ${s.days}/${goal} 天，差 ${goal - s.days} 天（奶茶候选人）`;
      const parts = [mine, `共 ${(s.totalMinutes / 60).toFixed(1)} 小时`];
      if (b.full) parts.push("全勤");
      if (b.streak >= 2) parts.push(`连续第 ${b.streak} 周达标`);
      if (b.improved) parts.push("比上周多");
      const note = noteByUser.get(u.id);
      if (note) parts.push(`本周一句话：${note}`);
      const summary = `${parts.join(" · ")} · ${groupLine}`;
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
