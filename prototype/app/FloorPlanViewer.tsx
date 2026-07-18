"use client";

import { useEffect, useRef, useState } from "react";
import { processFloorPlan } from "@/lib/floor-plan/processing";
import { createFloorPlanViewer, type ViewerMarker } from "@/lib/floor-plan/rendering";

export type Poi = { id: string; type: string; label: string; kind: "owner" | "operator"; x: number; y: number; z: number };

const MARKER_COLORS: Record<Poi["kind"], number> = { owner: 0x21a786, operator: 0xf06a54 };

const toMarkers = (pois: Poi[]): ViewerMarker[] =>
  pois.map((poi) => ({ id: poi.id, x: poi.x, y: poi.y, z: poi.z, color: MARKER_COLORS[poi.kind] }));

export function FloorPlanViewer({
  image,
  pois,
  editable = false,
  placing = false,
  selectedId,
  onSelect,
  onPlace,
  onMove,
}: {
  image: string;
  pois: Poi[];
  editable?: boolean;
  placing?: boolean;
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  onPlace?: (point: { x: number; y: number; z: number }) => void;
  onMove?: (id: string, position: Pick<Poi, "x" | "y" | "z">) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof createFloorPlanViewer> | undefined>(undefined);
  const [status, setStatus] = useState("Processing floor plan…");

  // Latest callbacks kept in refs so the viewer can be created once per image
  // while always calling through to the current React handlers.
  const onSelectRef = useRef(onSelect);
  const onPlaceRef = useRef(onPlace);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onSelectRef.current = onSelect; onPlaceRef.current = onPlace; onMoveRef.current = onMove; });

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
      viewer = createFloorPlanViewer(container, model, {
        backgroundColor: 0x10201d,
        wallColor: 0xe9e2d4,
        markers: toMarkers(pois),
        onSelect: (id) => onSelectRef.current?.(id),
        onPlace: (point) => onPlaceRef.current?.(point),
        onMove: (id, point) => onMoveRef.current?.(id, point),
      });
      viewerRef.current = viewer;
      setStatus(model.walls.length ? `${model.walls.length} wall regions generated` : "No wall regions found — use a high-contrast floor plan");
    };
    source.onerror = () => setStatus("Unable to read this floor plan image");
    source.src = image;
    return () => { cancelled = true; viewer?.dispose(); viewerRef.current = undefined; };
  }, [image]);

  useEffect(() => { viewerRef.current?.setMarkers(toMarkers(pois)); }, [pois]);
  useEffect(() => { viewerRef.current?.setSelection(editable ? selectedId : undefined); }, [selectedId, editable]);
  useEffect(() => { viewerRef.current?.setPlacementMode(editable && placing); }, [placing, editable]);

  const active = pois.find((poi) => poi.id === selectedId);
  const hint = placing
    ? "Placement mode — click the model to drop the marker"
    : active
      ? `Selected: ${active.type} — drag the gizmo arrows to reposition`
      : `${pois.length} POIs in view`;

  return (
    <div className={`viewer-wrap${placing ? " placing" : ""}`}>
      <div className="viewer" ref={host} />
      <div className="viewer-status">
        <span>{status}</span>
        <span>{hint}</span>
      </div>
    </div>
  );
}
