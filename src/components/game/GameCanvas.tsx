"use client";
import { useEffect, useRef } from "react";
import type { SceneInit } from "@/game/OfficeScene";

/** Mounts the Phaser world. Phaser is imported dynamically (client only). */
export default function GameCanvas({ init }: { init: SceneInit }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: import("phaser").Game | null = null;
    let dead = false;
    (async () => {
      const Phaser = await import("phaser");
      const { OfficeScene } = await import("@/game/OfficeScene");
      await document.fonts?.load("10px VT323").catch(() => {});
      if (dead || !ref.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: ref.current, pixelArt: true, roundPixels: true, antialias: false,
        backgroundColor: "#141019",
        fps: { smoothStep: false, min: 5 },
        scale: { mode: Phaser.Scale.RESIZE, width: ref.current.clientWidth, height: ref.current.clientHeight },
        physics: { default: "arcade", arcade: { debug: false, fixedStep: false } },
        input: { keyboard: { target: window } },
        scene: [],
      });
      game.scene.add("office", OfficeScene, true, init);
      (window as unknown as { __hq?: unknown; __hqBus?: unknown }).__hq = game;
      (window as unknown as { __hqBus?: unknown }).__hqBus = (await import("@/game/bus")).bus;
    })();
    return () => { dead = true; game?.destroy(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className="absolute inset-0" data-testid="game" />;
}
