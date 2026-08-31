import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

// Prisma 7 requires a driver adapter at runtime (no Rust query engine).
// better-sqlite3 resolves relative paths against process.cwd(), while the
// Prisma 7 CLI resolves a relative DATABASE_URL ("file:./dev.db") against the
// project root (where prisma7.config.ts lives). Resolve to an absolute path
// anchored on this file's location (prisma/ -> project root) so migrations
// and the seed always open the same file regardless of cwd.
const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
const dbFile = url.replace(/^file:/, "");
const projectRoot = path.resolve(import.meta.dirname, "..");
const absoluteUrl = `file:${path.isAbsolute(dbFile) ? dbFile : path.resolve(projectRoot, dbFile)}`;

const adapter = new PrismaBetterSqlite3({ url: absoluteUrl });
const prisma = new PrismaClient({ adapter });

// 秘密值一律用 crypto 生成（Math.random 不是密码学安全的）。
// charset 去掉了易混淆的 I/L/O/0/1，便于口头转告邀请码。
const READABLE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 8 位大写字母+数字邀请码 */
const inviteCode = () =>
  Array.from({ length: 8 }, () => READABLE_CHARSET[crypto.randomInt(READABLE_CHARSET.length)]).join("");

/** ≥32 位十六进制 cron secret */
const cronSecret = () => crypto.randomBytes(16).toString("hex"); // 16 字节 → 32 个 hex 字符

/** 日志脱敏：只露前 2 位，其余打码（秘密值不整串进日志） */
const mask = (value: string) => `${value.slice(0, 2)}***`;

async function main() {
  const defaults: Record<string, string> = {
    invite_code: inviteCode(),
    deadline_hour: "1", // 次日 01:00
    remind_hour: "21",
    cron_secret: cronSecret(),
    exam_date: "",
  };
  // 幂等：已存在的 key 不覆盖（update: {}），管理员改过的值不会被 seed 冲掉
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
    const secret = key === "invite_code" || key === "cron_secret";
    console.log(`[seed] Setting upserted: key=${key} value=${secret ? mask(value) : value}`);
  }
  const total = await prisma.setting.count();
  console.log(`[seed] done, Setting rows in DB: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[seed] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
