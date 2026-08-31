"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const PHOTO_LIMIT = 3;
const LONG_EDGE = 1600;
const INITIAL_QUALITY = 0.8;
const QUALITY_FLOOR = 0.3;
const TARGET_BYTES = 300 * 1024;

/** 上传状态：压缩完成即自动 POST /api/photos；失败可重试或移除。 */
export type PhotoStatus = "uploading" | "done" | "error";

export interface PhotoItem {
  key: string;
  name: string;
  blob: Blob; // 压缩产物（JPEG），上传直接用它
  url: string; // 预览缩略图
  status: PhotoStatus;
}

export interface PhotoPickerHandle {
  /** 等待全部在途上传结束后，返回仍被保留且上传成功的照片 id。
   *  已移除/上传失败的照片不会出现在结果里（失败会通过 onError 告知，
   *  界面上也有失败标记，可重试或移除——不会静默丢弃）。 */
  getPhotoIds: () => Promise<number[]>;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片编码失败"))),
      "image/jpeg",
      quality,
    );
  });
}

/** 压缩到长边 ≤1600px、初始质量 0.8；超过 300KB 就继续降质量（下限 0.3）。 */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 不可用");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > QUALITY_FLOOR) {
    quality = Math.max(QUALITY_FLOOR, Number((quality - 0.1).toFixed(2)));
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;

export default function PhotoPicker({
  handleRef,
  onError,
}: {
  handleRef: RefObject<PhotoPickerHandle | null>;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [compressing, setCompressing] = useState(0);

  // key → 上传结果（photoId；null = 失败）。用 ref 而非 state 读取，
  // 提交瞬间 React 渲染可能滞后，这里必须同步可读。
  const resultsRef = useRef(new Map<string, number | null>());
  // 在途任务（压缩+上传）：getPhotoIds 统一等待，避免漏掉刚选的照片
  const tasksRef = useRef(new Map<string, Promise<void>>());
  // 已移除的照片：上传仍在飞也不能把 id 计入结果
  const cancelledRef = useRef(new Set<string>());

  useImperativeHandle(
    handleRef,
    () => ({
      getPhotoIds: async () => {
        await Promise.allSettled([...tasksRef.current.values()]);
        const ids = [...resultsRef.current.values()].filter(
          (v): v is number => v != null,
        );
        const failed = resultsRef.current.size - ids.length;
        if (failed > 0)
          onError?.(`${failed} 张照片上传失败，本次打卡未带上；可重试或移除`);
        return ids;
      },
    }),
    [onError],
  );

  // 卸载时释放仍在用的预览 URL（已移除的在 remove 里即时释放）
  const photosRef = useRef<PhotoItem[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    [],
  );

  const uploadPhoto = useCallback(async (item: PhotoItem): Promise<void> => {
    try {
      const fd = new FormData();
      // 压缩产物固定是 JPEG；文件名仅供服务端报错展示
      fd.append("files", item.blob, item.name || "photo.jpeg");
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const data = (await res.json().catch(() => null)) as {
        photoIds?: number[];
      } | null;
      const id = data?.photoIds?.[0];
      if (typeof id !== "number") throw new Error("unexpected response");
      if (!cancelledRef.current.has(item.key)) {
        resultsRef.current.set(item.key, id);
        setPhotos((prev) =>
          prev.map((p) => (p.key === item.key ? { ...p, status: "done" } : p)),
        );
      }
    } catch {
      if (!cancelledRef.current.has(item.key)) {
        resultsRef.current.set(item.key, null);
        setPhotos((prev) =>
          prev.map((p) => (p.key === item.key ? { ...p, status: "error" } : p)),
        );
      }
    }
  }, []);

  // 任务结束后自摘，getPhotoIds 只需等仍在飞的
  const runTask = useCallback((key: string, task: Promise<void>) => {
    tasksRef.current.set(
      key,
      task.finally(() => tasksRef.current.delete(key)),
    );
  }, []);

  const pick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      e.target.value = ""; // 允许重复选同一张
      const room = PHOTO_LIMIT - photos.length - compressing;
      if (room <= 0) {
        onError?.(`最多 ${PHOTO_LIMIT} 张照片`);
        return;
      }
      if (files.length > room) onError?.(`最多 ${PHOTO_LIMIT} 张照片，已忽略多余的张数`);

      const batch = files.slice(0, room);
      setCompressing((n) => n + batch.length);
      for (const file of batch) {
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const task = (async () => {
          try {
            const blob = await compressImage(file);
            const item: PhotoItem = {
              key,
              name: file.name,
              blob,
              url: URL.createObjectURL(blob),
              status: "uploading",
            };
            setPhotos((prev) => [...prev, item]);
            await uploadPhoto(item);
          } catch {
            onError?.(`「${file.name}」处理失败，已跳过`);
          } finally {
            setCompressing((n) => Math.max(0, n - 1));
          }
        })();
        runTask(key, task);
      }
    },
    [compressing, onError, photos.length, runTask, uploadPhoto],
  );

  const retry = useCallback(
    (item: PhotoItem) => {
      setPhotos((prev) =>
        prev.map((p) => (p.key === item.key ? { ...p, status: "uploading" } : p)),
      );
      resultsRef.current.delete(item.key);
      runTask(item.key, uploadPhoto(item));
    },
    [runTask, uploadPhoto],
  );

  const remove = useCallback((key: string) => {
    cancelledRef.current.add(key);
    resultsRef.current.delete(key);
    tasksRef.current.delete(key);
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.key !== key);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={photos.length + compressing >= PHOTO_LIMIT || compressing > 0}
          onClick={() => inputRef.current?.click()}
        >
          添加照片
        </Button>
        <Badge variant="secondary">
          {photos.length}/{PHOTO_LIMIT}
        </Badge>
        {compressing > 0 && (
          <span className="text-xs text-muted-foreground">压缩中…</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={pick}
      />
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.key} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览的 objectURL，无需 next/image */}
              <img
                src={p.url}
                alt={p.name}
                className="aspect-square w-full rounded-md object-cover"
              />
              <button
                type="button"
                aria-label={`移除 ${p.name}`}
                className="absolute top-1 right-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                onClick={() => remove(p.key)}
              >
                ✕
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                {p.status === "uploading" ? "上传中…" : kb(p.blob.size)}
              </span>
              {p.status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md bg-black/70 p-1 text-white">
                  <span className="text-[10px]">上传失败</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => retry(p)}
                  >
                    重试
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
