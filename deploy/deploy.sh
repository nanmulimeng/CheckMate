#!/usr/bin/env bash
# ============================================================================
# deploy.sh — 从开发机执行的部署脚本（bash deploy/deploy.sh）
#
# 用法：
#   SSH_HOST=root@你的服务器IP bash deploy/deploy.sh        # 默认 22 端口
#   SSH_HOST=root@1.2.3.4 SSH_PORT=2222 bash deploy/deploy.sh
#
# 前置：服务器已跑过 deploy/setup.sh（Node20/pnpm/pm2/Caddy/工具链/数据目录/crontab）。
#
# 流程：
#   开发机：pnpm build → 组装发布包（standalone 产物 + 静态资源 + prisma）→ scp 上传
#   服务器：解压到 /opt/seti/releases/<时间戳>/ → 装依赖（含原生模块编译）→
#           数据库迁移（每次都跑，prisma migrate deploy 本身幂等）→
#           首次部署才 seed → 剪掉 devDependencies → 切 current 软链 → pm2 拉起 →
#           替换 /etc/crontab 的 __SECRET__ 占位（只在占位还在时执行，天然幂等）
#
# 设计决策（与部署计划基线的差异，均有注释标明原因）：
#   * 依赖安装用「全量 install + 结尾 pnpm prune --prod」而不是 --prod：
#     prisma CLI / tsx / dotenv 都在 devDependencies，migrate deploy 与 seed 需要它们；
#     先全量装、跑完迁移再剪枝，运行时最终仍是纯生产依赖。
#   * 不加 --ignore-scripts：better-sqlite3 必须在服务器上现场编译原生绑定
#    （开发机是 Windows，产物里的 .node 文件在 Linux 上不可用）。
#     pnpm 10 默认拦截依赖的构建脚本，这里用
#     `pnpm config set only-built-dependencies better-sqlite3 --location project`
#     写入项目 .npmrc 显式放行（选择：项目级配置，不污染全局）。
#   * .next/static 直接打进发布包（每次部署都带上），而不是只在首次部署时 cp：
#     每次构建的静态资源 hash 都会变，只拷一次会导致后续版本 JS/CSS 404。
# ============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:?请设置 SSH_HOST，如 root@你的服务器IP}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_ROOT="/opt/seti"
TS="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="$REMOTE_ROOT/releases/$TS"
STAGE=".release-stage"

# 无论成功还是中途失败（set -e 触发 exit），本地临时目录/发布包都不留在工作区：
# 残留物会被「git add -A」误提交（standalone 打包产物体积不小）。
trap 'rm -rf "$STAGE" ".release-$TS.tar.gz"' EXIT

ssh_cmd() { ssh -p "$SSH_PORT" "$SSH_HOST" "$@"; }

echo "==> [1/5] 本地构建（pnpm build，standalone 产物输出到 .next/standalone）"
pnpm build

echo "==> [2/5] 组装发布包"
rm -rf "$STAGE" && mkdir -p "$STAGE"
# standalone 主体（server.js + 精简 node_modules + .next/server 产物）
cp -r .next/standalone/. "$STAGE/"
# 本地跑 standalone 时 DATA_DIR 默认落 cwd/data，会被 trace 进产物——运行时数据绝不能进发布包
rm -rf "$STAGE/data"
# 静态资源必须随每次构建一起发布（hash 文件名，见文件头说明）
mkdir -p "$STAGE/.next"
cp -r .next/static "$STAGE/.next/static"
cp -r public "$STAGE/public"
# 迁移/seed 与包管理清单（package.json 覆盖 standalone 里那份最小化的，供 pnpm install 用）
cp package.json pnpm-lock.yaml "$STAGE/"
[ -f prisma7.config.ts ] && cp prisma7.config.ts "$STAGE/"
cp -r prisma "$STAGE/prisma"
tar -C "$STAGE" -czf ".release-$TS.tar.gz" .
echo "    发布包：.release-$TS.tar.gz（$(du -h ".release-$TS.tar.gz" | cut -f1)）"

echo "==> [3/5] 上传到 $RELEASE_DIR"
ssh_cmd "mkdir -p '$RELEASE_DIR' /var/lib/seti/photos /var/lib/seti/backups"
scp -P "$SSH_PORT" ".release-$TS.tar.gz" "$SSH_HOST:$RELEASE_DIR/release.tar.gz"

echo "==> [4/5] 服务器端：解压 / 装依赖 / 迁移数据库 / 切换版本 / 拉起进程"
ssh -p "$SSH_PORT" "$SSH_HOST" bash -s -- "$TS" "$RELEASE_DIR" "$REMOTE_ROOT" <<'REMOTE'
set -euo pipefail
TS="$1"; RELEASE_DIR="$2"; REMOTE_ROOT="$3"
cd "$RELEASE_DIR"
tar xzf release.tar.gz && rm release.tar.gz

# standalone 自带的 node_modules 是开发机（Windows）上 trace 出来的，
# 原生二进制在 Linux 不可用 → 删掉重装，保证全部由本机产出
rm -rf node_modules

# pnpm 10 默认拦截依赖构建脚本；better-sqlite3 需要放行（写入项目 .npmrc）
pnpm config set only-built-dependencies better-sqlite3 --location project
pnpm install
# 双保险：即使上面的放行配置在新版 pnpm 失效，rebuild 也强制编译一次原生绑定
pnpm rebuild better-sqlite3

# 生成 Prisma Client（输出到 src/generated/prisma，随 .gitignore 不进发布包，
# 必须在服务器上现场生成）：seed.ts 直接 import 它，缺了首个部署就会 module-not-found。
pnpm exec prisma generate

export DATABASE_URL='file:/var/lib/seti/prisma.db'
pnpm exec prisma migrate deploy

FIRST_DEPLOY=0
if [ ! -L "$REMOTE_ROOT/current" ]; then
  FIRST_DEPLOY=1
  echo "    首次部署：执行 seed（生成邀请码 / cron_secret 等初始 Setting）"
  pnpm exec tsx prisma/seed.ts
fi

# 剪掉 devDependencies，运行时保持纯生产依赖
pnpm prune --prod

ln -sfn "$RELEASE_DIR" "$REMOTE_ROOT/current"
echo "    current -> $RELEASE_DIR"
REMOTE

echo "==> [5/5] 服务器端：PM2 配置 / 会话密钥 / crontab secret 替换"
scp -P "$SSH_PORT" deploy/ecosystem.config.cjs "$SSH_HOST:$REMOTE_ROOT/ecosystem.config.cjs"
ssh -p "$SSH_PORT" "$SSH_HOST" bash -s -- "$RELEASE_DIR" "$REMOTE_ROOT" <<'REMOTE'
set -euo pipefail
RELEASE_DIR="$1"; REMOTE_ROOT="$2"
cd "$REMOTE_ROOT"

# SESSION_SECRET 只存在于服务器上的 .env.production（权限 600，绝不入库/不提交）。
# 首次生成 64 位 hex（iron-session 要求 ≥32 字符）；之后每次部署复用同一份。
if [ ! -f .env.production ] || ! grep -q '^SESSION_SECRET=' .env.production; then
  ( umask 077 && printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env.production )
  echo "    已生成新的 SESSION_SECRET"
fi
SESSION_SECRET="$(grep '^SESSION_SECRET=' .env.production | head -n1 | cut -d= -f2-)"

# 与 cron secret 同款防线：密钥只应是 hex（openssl rand -hex 32），
# 含 shell/sed 元字符时拒绝写入，避免 .env.production 被篡改后注入 sed 表达式
case "$SESSION_SECRET" in
  "") echo "    错误：.env.production 里没有可用的 SESSION_SECRET" >&2; exit 1 ;;
  *[!A-Za-z0-9]*) echo "    错误：SESSION_SECRET 含意外字符，拒绝写入 sed" >&2; exit 1 ;;
esac

# ecosystem.config.cjs 按部署基线原样提交；此处现场替换：
#   __SESSION_SECRET__ → .env.production 里的密钥
#   cwd /opt/seti → /opt/seti/current（配合 releases/ 软链发布与回滚）
sed -i -e "s|__SESSION_SECRET__|$SESSION_SECRET|" \
       -e 's|cwd: "/opt/seti"|cwd: "/opt/seti/current"|' ecosystem.config.cjs
chmod 600 ecosystem.config.cjs

# /etc/crontab 的 __SECRET__ 占位只在首次部署替换（占位已消失时 sed 无事可做）。
# 服务器没装 sqlite3 CLI，改用 node + 发布包里的 better-sqlite3 读 Setting 表。
if [ -f /etc/crontab ] && grep -q '__SECRET__' /etc/crontab; then
  CRON_SECRET="$(cd "$RELEASE_DIR" && node -e '
    const db = require("better-sqlite3")("/var/lib/seti/prisma.db");
    const row = db.prepare("SELECT value FROM Setting WHERE key = ?").get("cron_secret");
    console.log(row ? row.value : "");')"
  case "$CRON_SECRET" in
    "") echo "    错误：生产库没有 cron_secret（seed 是否执行过？）" >&2; exit 1 ;;
    *[!A-Za-z0-9]*) echo "    错误：cron_secret 含意外字符，拒绝写入 sed" >&2; exit 1 ;;
  esac
  sed -i "s|__SECRET__|$CRON_SECRET|g" /etc/crontab
  echo "    /etc/crontab secret 占位已替换"
fi

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
echo "    部署完成：$RELEASE_DIR"
REMOTE

# 本地临时目录/发布包由开头的 trap EXIT 兜底清理（成功与失败路径都覆盖）
echo "全部完成。访问 http://服务器IP:8080 验收（记得阿里云安全组放行 8080/tcp）。"