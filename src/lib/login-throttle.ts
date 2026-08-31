// 登录失败限速（内存版）：按用户名计数，连续失败 MAX_FAILS 次后锁定 LOCK_MS。
// 本站单实例 PM2 部署，内存态即可；进程重启计数清零（可接受——重启不频繁，
// 爆破者也要重新攒次数）。查询在查库/验密码之前做：锁定期内不触达数据库，
// 顺带省掉匿名请求白白消耗的 bcrypt CPU，也不给用户名枚举信号。
// 锁定到期后条目删除、重新计数（约每 15 分钟最多试 4 次，速率已可忽略）。

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

type Entry = { fails: number; lockedUntil?: number };

const attempts = new Map<string, Entry>();

function keyOf(username: string) {
  return username.trim().toLowerCase();
}

// Map 上限保护：被扫描器塞随机用户名也不至于无限膨胀（满 1000 条时清掉未锁定的）
function evictIfNeeded() {
  if (attempts.size < 1000) return;
  const now = Date.now();
  for (const [k, v] of attempts)
    if (!v.lockedUntil || v.lockedUntil <= now) attempts.delete(k);
}

/** 该用户名当前是否处于锁定期 */
export function loginLocked(username: string): boolean {
  const k = keyOf(username);
  const e = attempts.get(k);
  if (!e?.lockedUntil) return false;
  if (e.lockedUntil <= Date.now()) {
    attempts.delete(k);
    return false;
  }
  return true;
}

/** 记一次登录失败；达到阈值进入锁定 */
export function recordLoginFail(username: string): void {
  evictIfNeeded();
  const k = keyOf(username);
  const e = attempts.get(k) ?? { fails: 0 };
  e.fails += 1;
  if (e.fails >= MAX_FAILS) e.lockedUntil = Date.now() + LOCK_MS;
  attempts.set(k, e);
}

/** 登录成功后清空该用户名的失败计数 */
export function clearLoginFails(username: string): void {
  attempts.delete(keyOf(username));
}

/** 测试专用：清空全部计数 */
export function resetLoginThrottle(): void {
  attempts.clear();
}
