#!/usr/bin/env bash
# ============================================================================
# deploy.sh — 从开发机执行的部署脚本（bash deploy/deploy.sh）
#
# 用法（开发机 ~/.ssh/config 里配好 Host checkmate 后）：
#   SSH_HOST=checkmate bash deploy/deploy.sh
#   或显式：SSH_HOST=nanmu@你的服务器IP bash deploy/deploy.sh        # 默认 22 端口
#
# 前置：服务器已跑过 deploy/setup.sh（pm2/pnpm/数据目录/crontab；
# 服务器为非空白机，Node 22 与 Caddy 均已存在，详见 setup.sh 头注）。
#
# 流程：
#   开发机：pnpm build → 组装发布包（standalone 产物 + 静态资源 + prisma）→ scp 上传
#   服务器：解压到 /opt/checkmate/releases/<时间戳>/ → 装依赖（跳过构建脚本）→
#           数据库迁移（每次都跑，prisma migrate deploy 本身幂等）→
#           首次部署才 seed → 剪掉 devDependencies → 切 current 软链 → pm2 拉起 →
#           替换 /etc/crontab 的 __SECRET__ 占位（只在占位还在时执行，天然幂等）
#
# 设计决策（与部署计划基线的差异，均有注释标明原因）：
#   * 依赖安装用「全量 install + 结尾 pnpm prune --prod」而不是 --prod：
#     prisma CLI / tsx / dotenv 都在 devDependencies，migrate deploy 与 seed 需要它们；
#     先全量装、跑完迁移再剪枝，运行时最终仍是纯生产依赖。
#   * 依赖安装加 --ignore-scripts：better-sqlite3 v13 的原生二进制随包分发
#    （prebuilds/linux-x64.node，node-gyp-build 运行时加载），构建脚本无需执行；
#    2026-08-31 实测：开发机（Windows 无 VS）与服务器（无 g++）上编译都会失败，
#    且失败会让 pnpm 以非零码退出、中断部署——跳过构建是唯一正确姿势。
#   * .next/static 直接打进发布包（每次部署都带上），而不是只在首次部署时 cp：
#     每次构建的静态资源 hash 都会变，只拷一次会导致后续版本 JS/CSS 404。
# ============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:?请设置 SSH_HOST，如 root@你的服务器IP}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_ROOT="/opt/checkmate"
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
# standalone 主体（server.js + .next/server 产物）。node_modules 不打包，原因有二：
# pnpm 的符号链接结构在 Windows 上 cp/tar 无法原样复制；且服务器端会重装依赖（见 [4/5]，
# Windows trace 出来的原生二进制在 Linux 不可用）。tar 管道替代 cp -r，同时避开 symlink。
tar -C .next/standalone --exclude='./node_modules' -cf - . | tar -C "$STAGE" -xf -
# 本地跑 standalone 时 DATA_DIR 默认落 cwd/data，会被 trace 进产物——运行时数据绝不能进发布包
rm -rf "$STAGE/data"
# Next 构建还会把开发机根目录的 .env 复制进 standalone 产物（里面是 dev 库地址/dev 密钥）：
# 既不能让它上服务器，也要防异常启动路径下被 @next/env 拿去兜底——生产环境只认 PM2 env
rm -f "$STAGE/.env"
# 静态资源必须随每次构建一起发布（hash 文件名，见文件头说明）
mkdir -p "$STAGE/.next"
cp -r .next/static "$STAGE/.next/static"
cp -r public "$STAGE/public"
# 迁移/seed 与包管理清单（package.json 覆盖 standalone 里那份最小化的，供 pnpm install 用；
# pnpm-workspace.yaml 是 pnpm 11 的 settings 载体，带 better-sqlite3 的 override，缺了服务器
# 安装会重新解析、override 失效 → adapter 又装回 12.x 空壳）
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "$STAGE/"
# set -euo pipefail 下 `[ -f x ] && cp` 在文件缺失时会以 1 退出整个脚本，改用 if
if [ -f prisma7.config.ts ]; then cp prisma7.config.ts "$STAGE/"; fi
cp -r prisma "$STAGE/prisma"
tar -C "$STAGE" -czf ".release-$TS.tar.gz" .
echo "    发布包：.release-$TS.tar.gz（$(du -h ".release-$TS.tar.gz" | cut -f1)）"

echo "==> [3/5] 上传到 $RELEASE_DIR"
ssh_cmd "mkdir -p '$RELEASE_DIR' /var/lib/checkmate/photos /var/lib/checkmate/backups"
scp -P "$SSH_PORT" ".release-$TS.tar.gz" "$SSH_HOST:$RELEASE_DIR/release.tar.gz"

echo "==> [4/5] 服务器端：解压 / 装依赖 / 迁移数据库 / 切换版本 / 拉起进程"
ssh -p "$SSH_PORT" "$SSH_HOST" bash -s -- "$TS" "$RELEASE_DIR" "$REMOTE_ROOT" <<'REMOTE'
set -euo pipefail
TS="$1"; RELEASE_DIR="$2"; REMOTE_ROOT="$3"
cd "$RELEASE_DIR"
tar xzf release.tar.gz && rm release.tar.gz

# 发布包不带 node_modules（Windows 复制不了 pnpm 的符号链接，且原生二进制平台不
# 通用，见 [2/5]）→ 服务器现场重装。--ignore-scripts：better-sqlite3 v13 的
# linux-x64 二进制随包分发于 prebuilds/，无需构建；服务器无 g++，编译必挂
rm -rf node_modules   # 发布包本无 node_modules，幂等双保险（历史版本曾携带）
pnpm install --ignore-scripts

# 生成 Prisma Client（输出到 src/generated/prisma，随 .gitignore 不进发布包，
# 必须在服务器上现场生成）：seed.ts 直接 import 它，缺了首个部署就会 module-not-found。
pnpm exec prisma generate

export DATABASE_URL='file:/var/lib/checkmate/prisma.db'
pnpm exec prisma migrate deploy

# seed 每次部署都跑：内部全是 upsert（update:{} 不覆盖管理员已改过的值），幂等。
# 若只在"首次部署"跑：日后库被清空/换库而 current 软链还在时，邀请码/cron_secret
# 永远补不回来（注册 503、cron 全 401）——判断维度应是"库缺不缺"而非"部署过没有"。
pnpm exec tsx prisma/seed.ts

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
#   cwd /opt/checkmate → /opt/checkmate/current（配合 releases/ 软链发布与回滚）
sed -i -e "s|__SESSION_SECRET__|$SESSION_SECRET|" \
       -e 's|cwd: "/opt/checkmate"|cwd: "/opt/checkmate/current"|' ecosystem.config.cjs
chmod 600 ecosystem.config.cjs

# /etc/crontab 的 __SECRET__ 占位只在首次部署替换（占位已消失时 sed 无事可做）。
# 服务器没装 sqlite3 CLI，改用 node + 发布包里的 better-sqlite3 读 Setting 表。
if [ -f /etc/crontab ] && grep -q '__SECRET__' /etc/crontab; then
  CRON_SECRET="$(cd "$RELEASE_DIR" && node -e '
    const db = require("better-sqlite3")("/var/lib/checkmate/prisma.db");
    const row = db.prepare("SELECT value FROM Setting WHERE key = ?").get("cron_secret");
    console.log(row ? row.value : "");')"
  case "$CRON_SECRET" in
    "") echo "    错误：生产库没有 cron_secret（seed 是否执行过？）" >&2; exit 1 ;;
    *[!A-Za-z0-9]*) echo "    错误：cron_secret 含意外字符，拒绝写入 sed" >&2; exit 1 ;;
  esac
  sudo sed -i "s|__SECRET__|$CRON_SECRET|g" /etc/crontab
  echo "    /etc/crontab secret 占位已替换"
fi

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# 健康检查：进程起不来（缺模块/配置错）时不该打印"全部完成"。
# standalone 首启要几秒，重试 10 次每次隔 2 秒；/login 是静态页，最轻量。
CODE=""
for i in $(seq 1 10); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3210/login || true)"
  [ "$CODE" = "200" ] && break
  sleep 2
done
if [ "$CODE" != "200" ]; then
  echo "    错误：健康检查失败（/login 返回 ${CODE:-无响应}），最近日志：" >&2
  pm2 logs checkmate --lines 30 --nostream >&2 || true
  exit 1
fi
echo "    健康检查通过（/login 200）"

# 清理旧版本，保留最近 5 个（current 指向的最新排在最前，不会误删；失败不阻断部署）
ls -1t "$REMOTE_ROOT/releases" | tail -n +6 | while read -r old; do
  rm -rf "$REMOTE_ROOT/releases/$old"
done

echo "    部署完成：$RELEASE_DIR"
REMOTE

# 本地临时目录/发布包由开头的 trap EXIT 兜底清理（成功与失败路径都覆盖）
echo "全部完成。访问 http://服务器IP:3210 验收（记得阿里云安全组放行 3210/tcp）。"