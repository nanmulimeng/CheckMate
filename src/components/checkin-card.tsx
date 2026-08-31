"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Heart, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 一张打卡卡的展示数据（服务端聚合后传入，全部可序列化） */
export interface CheckInCardData {
  id: number;
  displayName: string;
  subjectName: string;
  durationMinutes: number;
  note: string;
  hasPhoto: boolean;
  photoIds: number[];
  comments: { id: number; authorName: string; content: string }[];
  likeCount: number;
  likedByMe: boolean;
}

const COMMENT_LIMIT = 200;

export default function CheckinCard({ data }: { data: CheckInCardData }) {
  const router = useRouter();
  const [like, setLike] = useState({ liked: data.likedByMe, count: data.likeCount });
  const [likePending, setLikePending] = useState(false);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [zoomedPhotoId, setZoomedPhotoId] = useState<number | null>(null);

  // 评论提交后 router.refresh() 会送来新 props，但客户端组件不卸载、state 不重置。
  // 用「渲染期对齐」把点赞态拉回服务端真值（React 官方推荐的模式，无需 useEffect）。
  const likeTruth = `${data.likedByMe}:${data.likeCount}`;
  const [syncedTruth, setSyncedTruth] = useState(likeTruth);
  if (likeTruth !== syncedTruth) {
    setSyncedTruth(likeTruth);
    setLike({ liked: data.likedByMe, count: data.likeCount });
  }

  async function toggleLike() {
    if (likePending) return;
    setError("");
    const prev = like;
    setLikePending(true);
    setLike({ liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) }); // 乐观更新
    try {
      const res = await fetch(`/api/checkins/${data.id}/likes`, { method: "POST" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { liked: boolean; count: number };
      setLike({ liked: json.liked, count: json.count });
    } catch {
      setLike(prev); // 回滚
      setError("点赞失败，请重试");
    } finally {
      setLikePending(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    const content = commentText.trim();
    if (!content || commentPending) return;
    setError("");
    setCommentPending(true);
    try {
      const res = await fetch(`/api/checkins/${data.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setCommentText("");
        router.refresh(); // 评论列表由服务端渲染，刷新拉新
        return;
      }
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "评论失败，请重试");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setCommentPending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-medium">
          {data.displayName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{data.displayName}</p>
          <p className="text-xs text-muted-foreground">
            {data.subjectName} · {data.durationMinutes} 分钟
          </p>
        </div>
        <CardAction>
          {!data.hasPhoto && (
            <Badge className="border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-500/15 dark:text-yellow-300">
              无凭证
            </Badge>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {data.note && <p className="text-sm break-words whitespace-pre-wrap">{data.note}</p>}

        {data.photoIds.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {data.photoIds.map((pid) => (
              <li key={pid}>
                <button
                  type="button"
                  aria-label="放大查看照片"
                  className="block overflow-hidden rounded-md border"
                  onClick={() => setZoomedPhotoId(pid)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 鉴权私有图片路由，Next Image 优化管线不适用 */}
                  <img
                    src={`/api/photos/${pid}`}
                    alt="打卡照片"
                    loading="lazy"
                    className="size-20 object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleLike}
            disabled={likePending}
            aria-pressed={like.liked}
          >
            <Heart
              className={cn("size-4", like.liked ? "fill-red-500 text-red-500" : "text-muted-foreground")}
              aria-hidden
            />
            {like.count > 0 ? like.count : "赞"}
          </Button>
        </div>

        {data.comments.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
            {data.comments.map((c) => (
              <li key={c.id} className="text-sm break-words">
                <span className="font-medium">{c.authorName}</span>
                <span className="text-muted-foreground">：{c.content}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submitComment} className="flex gap-2">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={COMMENT_LIMIT}
            placeholder="说句鼓励的话…"
            aria-label={`评论 ${data.displayName} 的打卡`}
          />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            disabled={commentPending || !commentText.trim()}
          >
            <Send className="size-4" aria-hidden />
            <span className="sr-only">发送评论</span>
          </Button>
        </form>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>

      {zoomedPhotoId != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="照片大图"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomedPhotoId(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 鉴权私有图片路由，Next Image 优化管线不适用 */}
          <img
            src={`/api/photos/${zoomedPhotoId}`}
            alt="打卡照片大图"
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="关闭大图"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setZoomedPhotoId(null)}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </Card>
  );
}
