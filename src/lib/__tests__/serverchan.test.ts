import { describe, it, expect, vi } from "vitest";
import { sendServerChan } from "../serverchan";

describe("sendServerChan", () => {
  it("失败不抛异常返回 false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await sendServerChan("SCTxxx", "t")).toBe(false);
    vi.unstubAllGlobals();
  });
  it("成功返回 true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0 }) }));
    expect(await sendServerChan("SCTxxx", "t")).toBe(true);
    vi.unstubAllGlobals();
  });
});
