import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { getPrisma } from "@/lib/db";
import { deletePhoto } from "@/lib/photo-store";
import { getSetting } from "@/lib/settings";

// GET /api/cron/cleanup?secret=… — 03:30 由 crontab 调用。
// 删除悬挂照片：checkInId 为 null（上传暂存后从未绑定打卡）且 createdAt 超 24h
//（24h 缓冲避免误删「正在填写打卡表」用户的暂存照片）。
// 先查出待删行并逐个 unlink 磁盘文件，再删 DB 行（行删了就找不到文件路径了）。
// 单个文件删除失败只记日志不中断：DB 行照删，避免一条坏文件卡住整个清扫。
export async function GET(req: NextRequest) {
  try {
    const provided = req.nextUrl.searchParams.get("secret") ?? "";
    if (!cronAuthorized(provided, await getSetting("cron_secret")))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const db = getPrisma();
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const dangling = await db.photo.findMany({
      where: { checkInId: null, createdAt: { lt: cutoff } },
      select: { id: true, filePath: true },
    });

    let unlinked = 0;
    for (const p of dangling) {
      try {
        await deletePhoto(p.filePath);
        unlinked++;
      } catch (e) {
        console.error(`[api/cron/cleanup] 文件删除失败 photo=${p.id} path=${p.filePath}`, e);
      }
    }

    const result = await db.photo.deleteMany({
      where: { checkInId: null, createdAt: { lt: cutoff } },
    });
    return NextResponse.json({ deleted: result.count, unlinked });
  } catch (e) {
    console.error("[api/cron/cleanup GET]", e);
    return NextResponse.json({ error: "清理失败" }, { status: 500 });
  }
}
