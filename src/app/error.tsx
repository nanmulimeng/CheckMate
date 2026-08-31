"use client";

import { useEffect } from "react";
import Link from "next/link";

// 全局路由段错误边界：没有它，页面级异常给用户看的是裸的 Next 报错页
//（生产也是一段英文 + 白屏）。这里兜底成「出错了一律回首页」——
// 数据都在服务端，刷新/回首页就是最有效的恢复动作。
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest 是 Next 给服务端错误的关联 id，交给控制台方便对着 pm2 日志查
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">页面出错了</h1>
        <p className="text-sm text-muted-foreground">
          刷新一下通常就能恢复；持续出现的话把下方编号发给管理员。
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          回首页
        </Link>
      </div>
    </main>
  );
}
