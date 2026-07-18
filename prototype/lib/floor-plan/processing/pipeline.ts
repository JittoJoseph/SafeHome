import { FloorPlanModel, Ring, WallFootprint } from "../model";
import {
  BinaryMask,
  ImageDataLike,
  close,
  downsampleImage,
  open,
  thresholdToMask,
} from "./raster";
import { extractWallFootprints } from "./vectorize";

export interface ProcessingOptions {
  threshold?: number;
  openRadius?: number;
  closeRadius?: number;
  minComponentAreaFraction?: number;
  minHoleAreaFraction?: number;
  simplifyEpsilon?: number;
  maxProcessingDimension?: number;
  wallHeightMeters?: number;
  pixelsPerMeter?: number;
  textureDataUrl?: string;
}

const DEFAULTS = {
  closeRadius: 1,
  minComponentAreaFraction: 0.0005,
  minHoleAreaFraction: 0.0008,
  simplifyEpsilon: 1.5,
  maxProcessingDimension: 1400,
  wallHeightMeters: 2.7,
  assumedWallMeters: 0.12,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateWallThickness(mask: BinaryMask): number {
  const runs: number[] = [];
  const push = (r: number) => {
    if (r > 0) runs.push(r);
  };

  for (let y = 0; y < mask.height; y++) {
    let run = 0;
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]) {
        run++;
      } else {
        push(run);
        run = 0;
      }
    }
    push(run);
  }
  for (let x = 0; x < mask.width; x++) {
    let run = 0;
    for (let y = 0; y < mask.height; y++) {
      if (mask.data[y * mask.width + x]) {
        run++;
      } else {
        push(run);
        run = 0;
      }
    }
    push(run);
  }

  if (runs.length === 0) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}

function scaleRing(ring: Ring, factor: number): Ring {
  return factor === 1 ? ring : ring.map((p) => ({ x: p.x * factor, y: p.y * factor }));
}

function scaleFootprint(footprint: WallFootprint, factor: number): WallFootprint {
  return {
    outer: scaleRing(footprint.outer, factor),
    holes: footprint.holes.map((h) => scaleRing(h, factor)),
  };
}

export function processFloorPlan(
  image: ImageDataLike,
  options: ProcessingOptions = {},
): FloorPlanModel {
  const originalWidth = image.width;
  const originalHeight = image.height;

  const maxDim = options.maxProcessingDimension ?? DEFAULTS.maxProcessingDimension;
  const { image: work, scale } = downsampleImage(image, maxDim);
  const upscale = 1 / scale;

  const minDim = Math.min(work.width, work.height);
  const openRadius = options.openRadius ?? clamp(Math.round(minDim * 0.004), 1, 6);
  const closeRadius = options.closeRadius ?? DEFAULTS.closeRadius;

  const binary = thresholdToMask(work, options.threshold);
  const cleaned = close(open(binary, openRadius), closeRadius);

  const totalArea = work.width * work.height;
  const footprints = extractWallFootprints(cleaned, {
    minComponentArea:
      (options.minComponentAreaFraction ?? DEFAULTS.minComponentAreaFraction) * totalArea,
    minHoleArea: (options.minHoleAreaFraction ?? DEFAULTS.minHoleAreaFraction) * totalArea,
    simplifyEpsilon: options.simplifyEpsilon ?? DEFAULTS.simplifyEpsilon,
  }).map((f) => scaleFootprint(f, upscale));

  const wallThicknessPx = estimateWallThickness(cleaned) * upscale;
  const pixelsPerMeter =
    options.pixelsPerMeter ??
    (wallThicknessPx > 0
      ? clamp(wallThicknessPx / DEFAULTS.assumedWallMeters, 5, 400)
      : 40);

  return {
    imageWidth: originalWidth,
    imageHeight: originalHeight,
    floor: {
      bounds: { minX: 0, minY: 0, maxX: originalWidth, maxY: originalHeight },
      textureDataUrl: options.textureDataUrl,
    },
    walls: footprints,
    pixelsPerMeter,
    wallHeightMeters: options.wallHeightMeters ?? DEFAULTS.wallHeightMeters,
    wallThicknessPx,
  };
}
