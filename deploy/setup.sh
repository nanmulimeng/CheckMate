#!/usr/bin/env bash
# ============================================================================
# setup.sh — 服务器初始化（以 nanmu 用户执行一次，需免密 sudo）
# 用法：ssh checkmate 'bash -s' < deploy/setup.sh
#
# 2026-08-31 实机勘察后定制（123.56.223.97 非空白服务器）：
#   已有：Node v22.14.0（/usr/local/node）、Caddy 2.6.4（服务 skills.nanmu.xyz，
#         占 80/443）、nginx（占 8080）、2G swap、firewalld 关闭、SELinux 关闭。
#   因此不装 Node、不装 Caddy、不建 swap、不动防火墙，也不碰任何既有服务。
#
# 做五件事：
#   1. pm2（用现有 Node 的 npm 全局安装）+ systemd 开机自启（以 nanmu 跑）
#   2. pnpm（corepack 方式）
#   3. 数据目录 /var/lib/checkmate（SQLite 库 + 照片 + 备份，属主 nanmu）
#   4. 发布根目录 /opt/checkmate（属主 nanmu）
#   5. /etc/crontab 业务定时任务（secret 占位 __SECRET__ 由 deploy.sh 首次部署替换）
#      + 每日凌晨备份（photos + prisma.db，保留最近 7 份）
#
# 唯一的手动步骤：阿里云控制台安全组放行 3210/tcp（firewalld 未运行，本机无需配置）。
# ============================================================================
set -euo pipefail

echo "==> [1/5] 检查前置（Node / 编译工具链 / sudo / 既有服务不受影响）"
export PATH="$PATH:/usr/local/node/bin"   # sudo 与非登录 shell 的 PATH 兜底
command -v node >/dev/null
node -v
sudo -n true && echo "    sudo 免密 OK"
# better-sqlite3 需在服务器源码编译（prebuilds 要求 GLIBC_2.33，本机 glibc 2.32，
# 详见 deploy.sh 的编译步骤）：gcc/make 系统自带，补 g++；系统 python3 是 3.6，
# 跑不动 node-gyp 11 的 gyp 脚本（walrus 语法要 3.8+），用 python3.11
if ! rpm -q gcc-c++ >/dev/null 2>&1; then
  sudo yum install -y gcc-c++
fi
command -v g++ >/dev/null || { echo "错误：缺 g++（gcc-c++），better-sqlite3 无法编译" >&2; exit 1; }
if ! command -v /usr/bin/python3.11 >/dev/null; then
  sudo yum install -y python3.11
fi
command -v /usr/bin/python3.11 >/dev/null || { echo "错误：缺 python3.11（系统 python3 过老，node-gyp 用不了）" >&2; exit 1; }

echo "==> [2/5] pm2 + 开机自启"
if ! command -v pm2 >/dev/null; then
  sudo env PATH="$PATH" npm i -g pm2
fi
# systemd unit 只建一次（幂等）；pm2 startup 需以 root 运行并指定实际运行用户
if [ ! -f /etc/systemd/system/pm2-nanmu.service ]; then
  sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u nanmu --hp /home/nanmu
fi
pm2 -v

echo "==> [3/5] pnpm（corepack 方式；禁用下载确认交互）"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
sudo env PATH="$PATH" corepack enable
corepack prepare pnpm@latest --activate
pnpm --version

echo "==> [4/5] 数据与发布目录"
sudo mkdir -p /var/lib/checkmate/photos /var/lib/checkmate/backups /opt/checkmate
sudo chown -R nanmu:nanmu /var/lib/checkmate /opt/checkmate

echo "==> [5/5] /etc/crontab（业务 cron + 备份；幂等：已有则跳过）+ 备份脚本"
# __SECRET__ 占位符由 deploy/deploy.sh 在首次部署时用生产库 Setting.cron_secret 替换。
# 应用监听 0.0.0.0:3210（直连对外），cron 走本机回环即可。
# remind 是每小时整点打点：到不到提醒小时由应用里的 Setting.remind_hour 决定
#（管理员在 /admin 改，即时生效，不用回来改 crontab）。
# weekly 定在周一 01:10：补卡窗口开到次日北京 01:00（src/lib/dates.ts 的截止），
# 结算必须等窗口关上再跑，否则凌晨补的周日卡会漏出周报。
# 备份走 backup.sh：SQLite 在线快照（避免直接 tar 运行中的库文件拿到撕裂副本）
# + 照片目录，保留最近 7 份，输出进 backups/backup.log。
sudo tee /opt/checkmate/backup.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
# 每日 04:00 由 /etc/crontab 调用；输出重定向到 backups/backup.log。
set -u
DATA=/var/lib/checkmate
BACKUPS=$DATA/backups
STAMP="$(date +%F)"
echo "===== $(date '+%F %T') backup start"
cd /opt/checkmate/current || { echo "ERROR: /opt/checkmate/current 不存在"; exit 1; }
node -e 'require("better-sqlite3")("/var/lib/checkmate/prisma.db").backup("/var/lib/checkmate/backups/prisma-snapshot.db").then(()=>console.log("sqlite snapshot ok"))' \
  || { echo "ERROR: sqlite 快照失败"; exit 1; }
tar czf "$BACKUPS/checkmate-$STAMP.tar.gz" -C / var/lib/checkmate/photos var/lib/checkmate/backups/prisma-snapshot.db \
  || { echo "ERROR: tar 打包失败"; exit 1; }
ls -t "$BACKUPS"/checkmate-*.tar.gz | tail -n +8 | xargs -r rm --
echo "===== $(date '+%F %T') backup done: checkmate-$STAMP.tar.gz ($(du -h "$BACKUPS/checkmate-$STAMP.tar.gz" | cut -f1))"
EOF
sudo chmod +x /opt/checkmate/backup.sh

if ! sudo grep -q 'api/cron/remind' /etc/crontab; then
  sudo tee -a /etc/crontab >/dev/null <<'EOF'
0 * * * * root curl -s "http://127.0.0.1:3210/api/cron/remind?secret=__SECRET__" >/dev/null
10 1 * * 1 root curl -s "http://127.0.0.1:3210/api/cron/weekly?secret=__SECRET__" >/dev/null
30 3 * * * root curl -s "http://127.0.0.1:3210/api/cron/cleanup?secret=__SECRET__" >/dev/null
0 4 * * * root /opt/checkmate/backup.sh >> /var/lib/checkmate/backups/backup.log 2>&1
EOF
  echo "    已写入（__SECRET__ 待 deploy.sh 替换）"
else
  echo "    /etc/crontab 已有任务，跳过"
fi

cat <<'NOTE'

>>> 重要提醒：在阿里云控制台放行安全组入方向 3210/tcp，否则外网访问不了
    （控制台 → ECS → 安全组 → 添加入方向规则：TCP 3210，源 0.0.0.0/0）。
    这一步只能手动在控制台做，脚本无法代替。

setup.sh 完成。接下来在开发机执行 deploy/deploy.sh 完成首次部署。
NOTE
