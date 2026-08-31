// cron 端点鉴权：?secret= 必须严格等于 Setting.cron_secret。
// expected 为空（未 seed / 被清空）时一律拒绝 —— 未初始化的库绝不能让 cron 裸奔。
export function cronAuthorized(provided: string, expected: string): boolean {
  return expected.length > 0 && provided === expected;
}
