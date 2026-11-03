"use client";
import { useEffect, useRef } from "react";
import { drawCharacter, DIRS, FRAME_H, FRAME_W, sanitizeAvatar, type Avatar, type Dir } from "@/shared/avatar";

/** Animated pixel avatar. `walk` cycles the 4 directions with the walking animation. */
export default function AvatarPreview({ avatar, scale = 4, walk = false, dir = "down", className = "" }: { avatar: Partial<Avatar> | Record<string, number>; scale?: number; walk?: boolean; dir?: Dir; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(avatar);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const av = sanitizeAvatar(avatar as Partial<Avatar>);
    let f = 0, raf = 0, last = 0;
    const draw = (t: number) => {
      if (t - last > 140) {
        last = t; f++;
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);
        const d: Dir = walk ? DIRS[Math.floor(f / 8) % 4] : dir;
        drawCharacter(ctx, 0, 0, av, d, walk ? [1, 0, 2, 0][f % 4] : 0);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, walk, dir]);
  return <canvas ref={ref} width={FRAME_W} height={FRAME_H} className={className} style={{ width: FRAME_W * scale, height: FRAME_H * scale, imageRendering: "pixelated" }} />;
}
