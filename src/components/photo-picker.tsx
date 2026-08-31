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

export interface PhotoItem {
  key: string;
  name: string;
  blob: Blob; // 压缩产物（JPEG），上传时直接用
  url: string; // 预览缩略图
}

export interface PhotoPickerHandle {
  /** 返回已上传照片的 id 列表。上传在 Task 7 接通（POST /api/photos），
   *  届时把压缩产物传上去换取 id；当前恒返回空数组，
   *  创建打卡的 API 已兼容 photoIds: []。 */
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

  useImperativeHandle(
    handleRef,
    () => ({
      getPhotoIds: async () => [],
    }),
    [],
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

      setCompressing((n) => n + Math.min(files.length, room));
      for (const file of files.slice(0, room)) {
        try {
          const blob = await compressImage(file);
          setPhotos((prev) => [
            ...prev,
            {
              key: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: file.name,
              blob,
              url: URL.createObjectURL(blob),
            },
          ]);
        } catch {
          onError?.(`「${file.name}」处理失败，已跳过`);
        } finally {
          setCompressing((n) => Math.max(0, n - 1));
        }
      }
    },
    [compressing, onError, photos.length],
  );

  const remove = useCallback((key: string) => {
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
                {kb(p.blob.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
