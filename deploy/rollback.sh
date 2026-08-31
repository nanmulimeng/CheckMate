#!/usr/bin/env bash
# ============================================================================
# rollback.sh — 回滚到上一个发布版（从开发机执行）
#
# 用法：
#   SSH_HOST=root@你的服务器IP bash deploy/rollback.sh          # 回滚到上一版
#   SSH_HOST=root@1.2.3.4 SSH_PORT=2222 bash deploy/rollback.sh
#   SSH_HOST=root@1.2.3.4 bash deploy/rollback.sh 20260831-120000  # 指定版本目录名
#
# 行为：
#   1. 找到 current 当前指向的版本，切到它之前的那一版（或参数指定的版本）
#   2. pm2 reload 平滑重启（老进程处理完在途请求再退出）
#   3. 顺手清理旧版本，只保留最近 3 个 releases 目录（当前指向的版本不会被删）
# 数据库不在回滚范围内：Prisma 迁移只前进，回滚代码不回滚 schema。
# ============================================================================
set -euo pipefail

SSH_HOST="${SSH_HOST:?请设置 SSH_HOST，如 root@你的服务器IP}"
SSH_PORT="${SSH_PORT:-22}"
TARGET="${1:-}" # 可选：要回滚到的版本目录名（/opt/seti/releases/ 下）
REMOTE_ROOT="/opt/seti"

ssh -p "$SSH_PORT" "$SSH_HOST" bash -s -- "$REMOTE_ROOT" "$TARGET" <<'REMOTE'
set -euo pipefail
REMOTE_ROOT="$1"; TARGET="$2"
cd "$REMOTE_ROOT"

[ -d releases ] || { echo "没有 $REMOTE_ROOT/releases，无从回滚" >&2; exit 1; }
[ -L current ] || { echo "current 软链不存在，尚未部署过" >&2; exit 1; }

CURRENT="$(basename "$(readlink -f current)")"
# 版本目录名是 YYYYmmdd-HHMMSS，字典序即时间序
ALL="$(ls -1 releases | sort -r)"

# 组装候选列表：从新到旧，去掉当前及更新的版本，剩下的最新一个就是回滚目标
ROLLBACK_TO=""
if [ -n "$TARGET" ]; then
  [ -d "releases/$TARGET" ] || { echo "版本 releases/$TARGET 不存在" >&2; exit 1; }
  ROLLBACK_TO="$TARGET"
else
  FOUND_CURRENT=0
  for v in $ALL; do
    if [ "$FOUND_CURRENT" = "1" ]; then ROLLBACK_TO="$v"; break; fi
    [ "$v" = "$CURRENT" ] && FOUND_CURRENT=1
  done
  [ -n "$ROLLBACK_TO" ] || { echo "当前已是最早的版本（$CURRENT），没有可回滚的目标" >&2; exit 1; }
fi

echo "回滚：$CURRENT -> $ROLLBACK_TO"
ln -sfn "$REMOTE_ROOT/releases/$ROLLBACK_TO" current
pm2 reload ecosystem.config.cjs --update-env

# 清理旧版本：保留最近 3 个，且绝不删 current 正指向的版本
KEEP="$(ls -1 releases | sort -r | head -n 3)"
for v in $(ls -1 releases | sort -r | tail -n +4); do
  [ "$v" = "$ROLLBACK_TO" ] && continue
  echo "清理旧版本：releases/$v"
  rm -rf "releases/$v"
done
echo "当前保留：$(echo "$KEEP" | tr '\n' ' ')"
REMOTE

echo "回滚完成：http://服务器IP:8080 已运行上一版。"
