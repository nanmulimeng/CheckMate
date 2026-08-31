// Server酱推送（https://sctapi.ftqq.com）。全项目唯一的推送出口：
// 催学（Task 9）与周报（Task 11）都复用本函数。
// 契约：永不抛出 —— 任何失败只 console.error 并返回 false，绝不影响调用方响应。
// 10s 超时：Server酱正常秒回，拖住不放会让 cron（尤其周结算的逐人循环）
// 白等几分钟；超时按失败处理即可，下次整点/下周自然会再推。
export async function sendServerChan(key: string, title: string, desp = ""): Promise<boolean> {
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && (json as { code?: number }).code === 0;
  } catch (e) {
    console.error("[serverchan] push failed:", e);
    return false;
  }
}
