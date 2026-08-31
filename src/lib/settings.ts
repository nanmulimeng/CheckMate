import { getPrisma } from "./db";
import { DEFAULT_DEADLINE_HOUR } from "./dates";

export async function getSetting(key: string): Promise<string> {
  const row = await getPrisma().setting.findUnique({ where: { key } });
  return row?.value ?? "";
}

/** 打卡截止小时（0-23，北京时间）：Setting.deadline_hour 是唯一可信来源，
 *  缺失或脏值回退默认。所有服务端调用方（打卡 API/编辑页/动态流）都从这里取，
 *  保证改一次全局生效。 */
export async function getDeadlineHour(): Promise<number> {
  const n = Number(await getSetting("deadline_hour"));
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_DEADLINE_HOUR;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getPrisma().setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
