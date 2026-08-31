import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { savePhoto } from "@/lib/photo-store";

// POST /api/photos — 上传照片（multipart/form-data，字段名 files）
// 1-3 张、每张 ≤5MB、MIME 白名单 jpeg/png/webp。
// 落盘后建 Photo 悬挂记录（checkInId=null），返回 { photoIds }；
// 创建打卡时由 /api/checkins 绑定，未绑定的悬挂照片由每日 cron 清理（Task 11）。
const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
// multipart 各 part 的边界行、字段名等表单开销远小于此余量
const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 64 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    // formData() 会把整个请求体（含全部文件内容）缓冲进内存，之后才轮到
    // 逐文件的 f.size 校验 —— 2G 内存的服务器上，一个超大请求能先把进程
    // 撑爆。所以必须在 formData() 之前用 Content-Length 拦总量：
    //   * 超上限 → 413，字节根本不进内存；
    //   * 缺 Content-Length（chunked 手造）→ 411。浏览器 FormData 上传
    //     一定带 CL，正常用户不受影响。
    const contentLength = Number(req.headers.get("content-length") ?? "");
    if (!Number.isInteger(contentLength) || contentLength <= 0)
      return NextResponse.json({ error: "缺少 Content-Length，拒绝上传" }, { status: 411 });
    if (contentLength > MAX_BODY_BYTES)
      return NextResponse.json(
        { error: `上传总量过大（单次最多 ${MAX_FILES} 张、每张 5MB）` },
        { status: 413 },
      );

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "请求需为 multipart/form-data" }, { status: 400 });
    }

    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (files.length === 0)
      return NextResponse.json({ error: "未收到照片（字段名需为 files）" }, { status: 400 });
    if (files.length > MAX_FILES)
      return NextResponse.json({ error: `一次最多上传 ${MAX_FILES} 张照片` }, { status: 400 });

    for (const f of files) {
      if (f.size === 0)
        return NextResponse.json({ error: "存在空文件" }, { status: 400 });
      if (f.size > MAX_FILE_BYTES)
        return NextResponse.json({ error: "单张照片不能超过 5MB" }, { status: 400 });
      if (!MIME_TO_EXT[f.type])
        return NextResponse.json(
          { error: "仅支持 JPEG / PNG / WebP 格式的照片" },
          { status: 400 },
        );
    }

    const db = getPrisma();
    const photoIds: number[] = [];
    for (const f of files) {
      const bytes = Buffer.from(await f.arrayBuffer());
      const filePath = await savePhoto(bytes, MIME_TO_EXT[f.type]);
      // checkInId 不设置（悬挂）：等打卡创建时绑定，防抢绑定由其 checkInId: null 条件保证
      const photo = await db.photo.create({ data: { filePath } });
      photoIds.push(photo.id);
    }
    return NextResponse.json({ photoIds });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/photos POST]", e);
    return NextResponse.json({ error: "照片上传失败，请稍后再试" }, { status: 500 });
  }
}
