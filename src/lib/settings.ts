import { getPrisma } from "./db";

export async function getSetting(key: string): Promise<string> {
  const row = await getPrisma().setting.findUnique({ where: { key } });
  return row?.value ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getPrisma().setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
