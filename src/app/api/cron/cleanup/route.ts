import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { getPrisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

// GET /api/cron/cleanup?secret=… — 03:30 由 crontab 调用。
// 删除悬挂照片：checkInId 为 null（上传暂存后从未绑定打卡）且 createdAt 超 24h
//（24h 缓冲避免误删「正在填写打卡表」用户的暂存照片）。
// 已知留白（Task 7 记录在案，Task 12 部署加固处理）：本清理以 DB 行为准，
// 「照片文件已落盘但 Photo 行创建失败」的文件不在可见范围内，无法被扫到。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const result = await getPrisma().photo.deleteMany({
      where: { checkInId: null, createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    console.error("[api/cron/cleanup GET]", e);
    return NextResponse.json({ error: "清理失败" }, { status: 500 });
  }
}
