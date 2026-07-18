"use client";

import { useEffect, useRef, useState } from "react";
import { processFloorPlan } from "@/lib/floor-plan/processing";
import { createFloorPlanViewer } from "@/lib/floor-plan/rendering";

export type Poi = { id: string; type: string; label: string; kind: "owner" | "operator"; x: number; y: number; z: number };

export function FloorPlanViewer({ image, pois, editable = false, onMove }: { image: string; pois: Poi[]; editable?: boolean; onMove?: (id: string, position: Pick<Poi, "x" | "y" | "z">) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof createFloorPlanViewer> | undefined>(undefined);
  const [selected, setSelected] = useState<string>();
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
      viewer = createFloorPlanViewer(container, model, { backgroundColor: 0x10201d, wallColor: 0xe9e2d4, markers: pois.map((poi) => ({ x: poi.x, y: poi.y, z: poi.z, color: poi.kind === "owner" ? 0x21a786 : 0xf06a54 })) });
      viewerRef.current = viewer;
      setStatus(model.walls.length ? `${model.walls.length} wall regions generated` : "No wall regions found — use a high-contrast floor plan");
    };
    source.onerror = () => setStatus("Unable to read this floor plan image");
    source.src = image;
    return () => { cancelled = true; viewer?.dispose(); viewerRef.current = undefined; };
  }, [image]);

  useEffect(() => { viewerRef.current?.setMarkers(pois.map((poi) => ({ x: poi.x, y: poi.y, z: poi.z, color: poi.kind === "owner" ? 0x21a786 : 0xf06a54 }))); }, [pois]);

  const move = (event: React.PointerEvent<HTMLButtonElement>, poi: Poi, axis: "x" | "y" | "z") => {
    if (!editable || !onMove) return;
    const tag = event.currentTarget; tag.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const update = (clientX: number, clientY: number) => {
      const next = { x: poi.x, y: poi.y, z: poi.z };
      if (axis === "x") next.x += (clientX - startX) / 40;
      if (axis === "z") next.z -= (clientY - startY) / 40;
      if (axis === "y") next.y = Math.max(0.15, poi.y - (clientY - startY) / 60);
      onMove(poi.id, next);
    };
    const drag = (e: PointerEvent) => update(e.clientX, e.clientY);
    const stop = () => { tag.removeEventListener("pointermove", drag); tag.removeEventListener("pointerup", stop); };
    tag.addEventListener("pointermove", drag); tag.addEventListener("pointerup", stop);
  };
  const active = pois.find((poi) => poi.id === selected);
  return <div className="viewer-wrap"><div className="viewer" ref={host}/>{pois.map((poi) => <button key={poi.id} onClick={() => setSelected(poi.id)} className={`world-dot ${poi.kind} ${selected === poi.id ? "chosen" : ""}`} style={{ left: `${50 + poi.x * 9}%`, top: `${50 - poi.z * 12 + poi.y * 2}%` }} aria-label={`Select ${poi.label}`}/>) }{active && editable && <div className="poi-gizmo" style={{ left: `${50 + active.x * 9}%`, top: `${50 - active.z * 12 + active.y * 2}%` }}><button onPointerDown={(event) => move(event, active, "x")} className="axis x" aria-label="Move along X axis">X</button><button onPointerDown={(event) => move(event, active, "y")} className="axis y" aria-label="Move along Y axis">Y</button><button onPointerDown={(event) => move(event, active, "z")} className="axis z" aria-label="Move along Z axis">Z</button><b>●</b></div>}<div className="viewer-status"><span>{status}</span><span>{active ? `Selected: ${active.type}` : `${pois.length} POIs in view`}</span></div></div>;
}
