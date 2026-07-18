"use client";

import { useEffect, useRef, useState } from "react";
import { processFloorPlan } from "@/lib/floor-plan/processing";
import { createFloorPlanViewer, type ViewerMarker } from "@/lib/floor-plan/rendering";

export type Poi = { id: string; type: string; label: string; kind: "owner" | "operator"; x: number; y: number; z: number };

const MARKER_COLORS: Record<Poi["kind"], number> = { owner: 0x1f9d78, operator: 0xff7759 };

const toMarkers = (pois: Poi[]): ViewerMarker[] =>
  pois.map((poi) => ({ id: poi.id, x: poi.x, y: poi.y, z: poi.z, color: MARKER_COLORS[poi.kind], title: poi.type, kind: poi.kind }));

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
        backgroundColor: 0x0a1512,
        wallColor: 0xe9e2d4,
        editable,
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
    // Recreate the viewer only when the image changes; pois/editable are pushed via dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  useEffect(() => { viewerRef.current?.setMarkers(toMarkers(pois)); }, [pois]);
  useEffect(() => { viewerRef.current?.setSelection(selectedId); }, [selectedId]);
  useEffect(() => { viewerRef.current?.setEditable(editable); }, [editable]);
  useEffect(() => { viewerRef.current?.setPlacementMode(editable && placing); }, [placing, editable]);

  const active = pois.find((poi) => poi.id === selectedId);
  const hint = placing
    ? "Click the model to drop the marker · Esc to cancel"
    : active && editable
      ? "Drag the gizmo arrows to reposition · X / Y / Z"
      : `${pois.length} ${pois.length === 1 ? "marker" : "markers"} in view`;

  return (
    <div className={`viewer-wrap${placing ? " placing" : ""}`}>
      <div className="viewer" ref={host} />
      <div className="viewer-toolbar">
        <span className="viewer-badge">{editable ? "Editable" : "Read only"}</span>
        {placing && <span className="viewer-badge mode">Placement mode</span>}
        {active && editable && !placing && <span className="viewer-badge mode">Editing · {active.type}</span>}
      </div>
      <div className="viewer-status">
        <span>{status}</span>
        <span>{hint}</span>
      </div>
    </div>
  );
}
