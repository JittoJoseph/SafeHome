"use client";

import { useEffect, useRef, useState } from "react";
import { processFloorPlan } from "@/lib/floor-plan/processing";
import { createFloorPlanViewer } from "@/lib/floor-plan/rendering";

export type Poi = { id: string; type: string; label: string; kind: "owner" | "operator"; x: number; z: number };

export function FloorPlanViewer({ image, pois, editable = false, onMove }: { image: string; pois: Poi[]; editable?: boolean; onMove?: (id: string, x: number, z: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Processing floor plan…");

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let viewer: ReturnType<typeof createFloorPlanViewer> | undefined;
    let cancelled = false;
    const source = new Image();
    source.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const model = processFloorPlan(pixels, { textureDataUrl: image });
      if (cancelled) return;
      viewer = createFloorPlanViewer(container, model, { backgroundColor: 0x10201d, wallColor: 0xe9e2d4, markers: pois.map((poi) => ({ x: poi.x, z: poi.z, color: poi.kind === "owner" ? 0x21a786 : 0xf06a54 })) });
      setStatus(model.walls.length ? `${model.walls.length} wall regions generated` : "No wall regions found — use a high-contrast floor plan");
    };
    source.onerror = () => setStatus("Unable to read this floor plan image");
    source.src = image;
    return () => { cancelled = true; viewer?.dispose(); };
  }, [image, pois]);

  const move = (event: React.PointerEvent<HTMLButtonElement>, poi: Poi) => {
    if (!editable || !onMove) return;
    const tag = event.currentTarget; tag.setPointerCapture(event.pointerId);
    const update = (clientX: number, clientY: number) => { const box = host.current?.getBoundingClientRect(); if (!box) return; onMove(poi.id, ((clientX - box.left) / box.width - .5) * 8, ((clientY - box.top) / box.height - .5) * -6); };
    const drag = (e: PointerEvent) => update(e.clientX, e.clientY);
    const stop = () => { tag.removeEventListener("pointermove", drag); tag.removeEventListener("pointerup", stop); };
    tag.addEventListener("pointermove", drag); tag.addEventListener("pointerup", stop);
  };
  return <div className="viewer-wrap"><div className="viewer" ref={host}/>{pois.map((poi) => <button key={poi.id} onPointerDown={(event) => move(event, poi)} className={`world-tag ${poi.kind}`} style={{ left: `${50 + poi.x * 9}%`, top: `${50 - poi.z * 12}%` }}><span>{poi.type}</span><b>{poi.label}</b></button>)}<div className="viewer-status"><span>{status}</span><span>{pois.length} POIs in view</span></div></div>;
}
