// PM2 进程定义（deploy.sh 会把本文件复制到 /opt/seti/ 并做两处现场替换：
//   1) cwd 改为 /opt/seti/current（当前发布版软链，releases/ 回滚机制）；
//   2) __SESSION_SECRET__ 替换为 /opt/seti/.env.production 里的 64 位 hex。
// 入口用 standalone 自带的 server.js（发布包根目录，next 官方对
// `next start` + output:standalone 的组合不支持、会告警）：
// PORT/HOSTNAME 是 server.js 认的环境变量；只绑本机回环，由 Caddy 反代对外。）
module.exports = { apps: [{
  name: "seti", cwd: "/opt/seti", script: "server.js",
  env: { TZ: "Asia/Shanghai", NODE_ENV: "production",
         PORT: "3000", HOSTNAME: "127.0.0.1",
         DATABASE_URL: "file:/var/lib/seti/prisma.db",
         SETI_DATA_DIR: "/var/lib/seti", SESSION_SECRET: "__SESSION_SECRET__" },
}]};
