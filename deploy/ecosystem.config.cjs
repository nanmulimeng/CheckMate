// PM2 进程定义（deploy.sh 会把本文件复制到 /opt/checkmate/ 并做两处现场替换：
//   1) cwd 改为 /opt/checkmate/current（当前发布版软链，releases/ 回滚机制）；
//   2) __SESSION_SECRET__ 替换为 /opt/checkmate/.env.production 里的 64 位 hex。
// 入口用 standalone 自带的 server.js（next 官方不支持 `next start` + output:standalone 组合）。
// 直连对外（0.0.0.0:3210）而非经反代：2026-08-31 实机勘察发现 8080 已被服务器上
// 既有 nginx 占用、80/443 由 Caddy 服务 skills.nanmu.xyz，且域名未备案无法走 443——
// v1 以独立端口对外；域名备案后可切 Caddy 子域名 + HTTPS 并收紧回 127.0.0.1。）
// SETI_DATA_DIR 是 src/lib/photo-store.ts 读取的环境变量名（历史命名，勿改）。
module.exports = { apps: [{
  name: "checkmate", cwd: "/opt/checkmate", script: "server.js",
  env: { TZ: "Asia/Shanghai", NODE_ENV: "production",
         PORT: "3210", HOSTNAME: "0.0.0.0",
         DATABASE_URL: "file:/var/lib/checkmate/prisma.db",
         SETI_DATA_DIR: "/var/lib/checkmate", SESSION_SECRET: "__SESSION_SECRET__" },
}]};
