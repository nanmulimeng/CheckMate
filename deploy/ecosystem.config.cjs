// PM2 进程定义（deploy.sh 会把本文件复制到 /opt/checkmate/ 并做两处现场替换：
//   1) cwd 改为 /opt/checkmate/current（当前发布版软链，releases/ 回滚机制）；
//   2) __SESSION_SECRET__ 替换为 /opt/checkmate/.env.production 里的 64 位 hex。
// 入口用 standalone 自带的 server.js（next 官方不支持 `next start` + output:standalone 组合）。
// 2026-09-11 域名上线（nanmu.xyz，备案通过）：应用收回 127.0.0.1:3000，由服务器上
// 既有 Caddy 反代对外（/etc/caddy/Caddyfile 里的 nanmu.xyz 站点块）；外网唯一入口是
// 443，安全组 3210/tcp 已关闭——IP 直连既到不了应用（不监听公网）也过不了安全组。
// SESSION_COOKIE_SECURE=1 与 HTTPS 同批开启（src/lib/auth.ts 读它给会话 cookie 加
// Secure 标记；此前 IP:3210 明文时代必须关着，否则浏览器拒收 cookie 登录静默失效）。
// SETI_DATA_DIR 是 src/lib/photo-store.ts 读取的环境变量名（历史命名，勿改）。
module.exports = { apps: [{
  name: "checkmate", cwd: "/opt/checkmate", script: "server.js",
  env: { TZ: "Asia/Shanghai", NODE_ENV: "production",
         PORT: "3000", HOSTNAME: "127.0.0.1",
         SESSION_COOKIE_SECURE: "1",
         DATABASE_URL: "file:/var/lib/checkmate/prisma.db",
         SETI_DATA_DIR: "/var/lib/checkmate", SESSION_SECRET: "__SESSION_SECRET__" },
}]};
