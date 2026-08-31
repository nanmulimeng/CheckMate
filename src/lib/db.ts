import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter at runtime (no Rust query engine).
// We must resolve the DATABASE_URL the same way the CLI does: a relative
// "file:./dev.db" is anchored at the project root (where prisma7.config.ts
// lives), NOT at process.cwd() as better-sqlite3 would by default. We cannot
// use import.meta.dirname here (like prisma/seed.ts does) because bundlers
// relocate server code into .next/, so we anchor on process.cwd() instead —
// `next dev` / `next start` / PM2 all run with cwd = project root. An
// absolute DATABASE_URL always wins.
const resolveUrl = () => {
  const url = process.env["DATABASE_URL"] ?? "file:./dev.db";
  const dbFile = url.replace(/^file:/, "");
  return `file:${path.isAbsolute(dbFile) ? dbFile : path.resolve(/* turbopackIgnore: true */ process.cwd(), dbFile)}`;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const getPrisma = (): PrismaClient => {
  // 生产环境必须显式给 DATABASE_URL：默认的 file:./dev.db 是 dev 兜底，
  // 生产误用会把数据写进 cwd 下的临时文件（PM2 重启/换目录即丢库）。
  // 放在 getPrisma 里而非模块顶层：next build（NODE_ENV=production）会加载
  // 页面模块做静态分析，顶层 throw 会把构建搞挂。
  if (!process.env["DATABASE_URL"] && process.env.NODE_ENV === "production")
    throw new Error(
      "DATABASE_URL 未设置：生产环境必须显式指定数据库路径（如 file:/var/lib/seti/prisma.db），" +
        "参见 deploy/ecosystem.config.cjs",
    );
  return (
    globalForPrisma.prisma ??
    (globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: resolveUrl() }),
    }))
  );
};

export type { PrismaClient } from "@/generated/prisma/client";
