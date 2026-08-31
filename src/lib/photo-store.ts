import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const DATA_DIR = process.env.SETI_DATA_DIR ?? path.join(process.cwd(), "data");

export function photoPathIsSafe(rel: string): boolean {
  const norm = path.normalize(rel);
  // 首段必须是字面 "photos"：startsWith("photos") 会被 "photos-evil/x" 这类
  // 同前缀目录绕过（库里只写过 photos/<月>/<uuid>，白名单按段比对）
  const segments = norm.split(path.sep).filter((s) => s !== "");
  return (
    !path.isAbsolute(norm) &&
    !norm.split(path.sep).includes("..") &&
    segments[0] === "photos"
  );
}

export async function savePhoto(bytes: Buffer, ext: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7);
  const rel = path.posix.join("photos", month, `${crypto.randomUUID()}.${ext}`);
  // DATA_DIR 运行时才定（SETI_DATA_DIR 可覆盖），turbopack 无法静态 tracing，
  // 与 src/lib/db.ts 同样用 turbopackIgnore 注解关掉整仓追踪告警。
  const abs = path.join(/*turbopackIgnore: true*/ DATA_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return rel.split(path.sep).join("/");
}

export async function readPhoto(rel: string): Promise<Buffer> {
  if (!photoPathIsSafe(rel)) throw new Error("unsafe path");
  return fs.readFile(path.join(/*turbopackIgnore: true*/ DATA_DIR, rel));
}

/** 删除照片文件；ENOENT（文件已不在）静默忽略，其余错误抛给调用方。 */
export async function deletePhoto(rel: string): Promise<void> {
  if (!photoPathIsSafe(rel)) throw new Error("unsafe path");
  try {
    await fs.unlink(path.join(/*turbopackIgnore: true*/ DATA_DIR, rel));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
