"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// /logout 直访落地页（此前 404，退出只有各页 header 里的按钮）：
// 挂载即调 POST /api/auth/logout，成功后回登录页。React 18 StrictMode 下
// effect 会跑两次，用 ref 保证只发一次请求（logout 接口本身幂等，双保险）。
export default function LogoutPage() {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // 网络失败也照跳：cookie 已尽力清理，登录页有自己的守卫
      } finally {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm text-muted-foreground">正在退出登录…</p>
      <Link href="/login" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
        没有自动跳转？点这里去登录页
      </Link>
    </main>
  );
}
