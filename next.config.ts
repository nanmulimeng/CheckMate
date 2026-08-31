import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone：构建产物输出到 .next/standalone（含精简 node_modules + server.js），
  // 供 deploy/deploy.sh 打包上传服务器，无需在服务器上装完整依赖树。
  output: "standalone",
  // better-sqlite3 是原生模块，Prisma 7 适配器在服务端运行时加载，
  // 不能被打包进 server bundle。
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3"],
};

export default nextConfig;
