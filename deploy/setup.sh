#!/usr/bin/env bash
# ============================================================================
# setup.sh — 服务器初始化（root 执行一次）
# 目标系统：Alibaba Cloud Linux 3（RHEL 系，dnf 包管理）
# 用法：scp deploy/setup.sh root@服务器:/root/ && ssh root@服务器 'bash /root/setup.sh'
#
# 做七件事：
#   1. Node 20 + 编译工具链（better-sqlite3 是原生模块，安装时要现场编译，
#      需要 gcc/g++/make/python3）
#   2. pm2（进程守护）+ pnpm（corepack 方式，随 Node 自带）
#   3. 2G swap 兜底（2G 内存的小机器跑 pnpm install 容易 OOM）
#   4. Caddy（反向代理，官方 copr 仓库）
#   5. 数据目录 /var/lib/seti（SQLite 库 + 照片 + 备份）
#   6. /etc/crontab 业务定时任务（secret 占位 __SECRET__ 由 deploy.sh 首次部署时替换）
#      + 每日凌晨备份（photos + prisma.db，保留最近 7 份）
#   7. 防火墙放行 8080/tcp
# ============================================================================
set -euo pipefail

echo "==> [1/7] Node 20 + 原生模块编译工具链 + pm2"
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs gcc gcc-c++ make python3
npm i -g pm2

echo "==> [2/7] pnpm（corepack 方式安装，Node 自带 corepack）"
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version

echo "==> [3/7] 2G swap（已启用或已写入 fstab 则跳过）"
# 注意：不能用 `swapon --show | grep -q seti-swap` —— swap 的 NAME 是
# /swapfile 这样的路径，永远不含 "seti-swap"，这个判断恒为假（会导致重复建 swap 而失败）。
# 正确判法：看当前已启用的 swap 设备，或 fstab 里已有记录。
if swapon --show | grep -q '/swapfile' || grep -q '^/swapfile ' /etc/fstab; then
  echo "    swap 已存在，跳过"
else
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    已创建并启用 2G swap"
fi

echo "==> [4/7] Caddy（官方 copr 仓库）"
dnf install -y 'dnf-command(copr)' && dnf copr enable -y @caddy/caddy
dnf install -y caddy

echo "==> [5/7] 数据目录"
mkdir -p /var/lib/seti/{photos,backups}
chown -R root:root /var/lib/seti

echo "==> [6/7] /etc/crontab（业务 cron + 备份；幂等：已有 seti 行则跳过）"
# __SECRET__ 占位符由 deploy/deploy.sh 在首次部署时用生产库 Setting.cron_secret 替换。
# 业务 cron 走本机回环访问 Next（127.0.0.1:3000），不暴露公网。
# remind 是每小时整点打点：到不到提醒小时由应用里的 Setting.remind_hour 决定
#（管理员在 /admin 改，即时生效，不用回来改 crontab）。
# 备份行打包照片目录 + SQLite 库文件，只保留最近 7 份。
if grep -q 'api/cron/remind' /etc/crontab; then
  echo "    /etc/crontab 已有 seti 任务，跳过"
else
  cat >> /etc/crontab <<'EOF'
0 * * * * root curl -s "http://127.0.0.1:3000/api/cron/remind?secret=__SECRET__" >/dev/null
10 0 * * 1 root curl -s "http://127.0.0.1:3000/api/cron/weekly?secret=__SECRET__" >/dev/null
30 3 * * * root curl -s "http://127.0.0.1:3000/api/cron/cleanup?secret=__SECRET__" >/dev/null
0 4 * * * root tar czf /var/lib/seti/backups/seti-$(date +\%F).tar.gz /var/lib/seti/photos /var/lib/seti/prisma.db 2>/dev/null && ls -t /var/lib/seti/backups/*.tar.gz | tail -n +8 | xargs -r rm --
EOF
  echo "    已写入（__SECRET__ 待 deploy.sh 替换）"
fi

echo "==> [7/7] 防火墙放行 8080/tcp（Caddy 监听端口）"
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=8080/tcp && firewall-cmd --reload
  echo "    firewalld 已放行 8080/tcp"
else
  echo "    firewalld 未运行，跳过（如有其它防火墙请自行放行）"
fi

cat <<'NOTE'

>>> 重要提醒：除本机防火墙外，还必须在阿里云控制台放行安全组入方向 8080/tcp，
    否则外网依然访问不了（控制台 → ECS → 安全组 → 添加入方向规则：TCP 8080，源 0.0.0.0/0）。
    这一步只能手动在控制台做，脚本无法代替。

setup.sh 完成。接下来在开发机执行 deploy/deploy.sh 完成首次部署。
NOTE
