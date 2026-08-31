import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { photoPathIsSafe, readPhoto } from "@/lib/photo-store";

type Ctx = { params: Promise<{ id: string }> };

// Content-Type 按扩展名映射（落盘时扩展名由 MIME 白名单决定）
const CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// GET /api/photos/[id] — 鉴权读取照片字节
// 任意登录用户可读（Photo 无属主，绑定即保护）；DB 记录或磁盘文件缺失都回 404。
// 消费端必须用普通 <img>：Next Image 优化管线不适用于鉴权私有路由。
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();

    const { id: raw } = await ctx.params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json({ error: "照片 id 不合法" }, { status: 400 });

    const photo = await getPrisma().photo.findUnique({ where: { id } });
    if (!photo || !photoPathIsSafe(photo.filePath))
      return NextResponse.json({ error: "照片不存在" }, { status: 404 });

    let bytes: Buffer;
    try {
      bytes = await readPhoto(photo.filePath);
    } catch {
      return NextResponse.json({ error: "照片文件已缺失" }, { status: 404 });
    }

    const ext = photo.filePath.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // 私有内容：禁止共享缓存存储
        "Cache-Control": "private",
      },
    });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/photos/[id] GET]", e);
    return NextResponse.json({ error: "读取照片失败" }, { status: 500 });
  }
}
