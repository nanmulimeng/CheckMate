// PM2 进程定义（deploy.sh 会把本文件复制到 /opt/seti/ 并做两处现场替换：
//   1) cwd 改为 /opt/seti/current（当前发布版软链，releases/ 回滚机制）；
//   2) __SESSION_SECRET__ 替换为 /opt/seti/.env.production 里的 64 位 hex。
// 本文件按部署计划基线保持原样提交，两个占位/路径由 deploy.sh 服务器侧处理。）
module.exports = { apps: [{
  name: "seti", cwd: "/opt/seti", script: "node_modules/next/dist/bin/next", args: "start -p 3000",
  env: { TZ: "Asia/Shanghai", NODE_ENV: "production",
         DATABASE_URL: "file:/var/lib/seti/prisma.db",
         SETI_DATA_DIR: "/var/lib/seti", SESSION_SECRET: "__SESSION_SECRET__" },
}]};
