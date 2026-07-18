import { Point2D, Ring, WallFootprint } from "../model";
import { BinaryMask } from "./raster";

interface Labeling {
  labels: Int32Array;
  width: number;
  height: number;
  count: number;
  areas: Int32Array;
  touchesBorder: Uint8Array;
}

class UnionFind {
  private parent: number[] = [0];

  make(): number {
    const id = this.parent.length;
    this.parent.push(id);
    return id;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

function labelComponents(
  mask: BinaryMask,
  target: 0 | 1,
  connectivity: 4 | 8,
): Labeling {
  const { width, height } = mask;
  const provisional = new Int32Array(width * height);
  const uf = new UnionFind();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask.data[i] !== target) continue;

      const neighbours: number[] = [];
      if (x > 0 && mask.data[i - 1] === target) neighbours.push(provisional[i - 1]);
      if (y > 0 && mask.data[i - width] === target) neighbours.push(provisional[i - width]);
      if (connectivity === 8) {
        if (x > 0 && y > 0 && mask.data[i - width - 1] === target)
          neighbours.push(provisional[i - width - 1]);
        if (x < width - 1 && y > 0 && mask.data[i - width + 1] === target)
          neighbours.push(provisional[i - width + 1]);
      }

      if (neighbours.length === 0) {
        provisional[i] = uf.make();
      } else {
        let min = neighbours[0];
        for (const n of neighbours) if (n < min) min = n;
        provisional[i] = min;
        for (const n of neighbours) uf.union(min, n);
      }
    }
  }

  const remap = new Map<number, number>();
  const labels = new Int32Array(width * height);
  let count = 0;
  const areas: number[] = [0];
  const border: number[] = [0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask.data[i] !== target) continue;

      const root = uf.find(provisional[i]);
      let dense = remap.get(root);
      if (dense === undefined) {
        dense = ++count;
        remap.set(root, dense);
        areas[dense] = 0;
        border[dense] = 0;
      }
      labels[i] = dense;
      areas[dense]++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border[dense] = 1;
    }
  }

  return {
    labels,
    width,
    height,
    count,
    areas: Int32Array.from(areas),
    touchesBorder: Uint8Array.from(border),
  };
}

const OFFSETS: ReadonlyArray<Point2D> = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

function traceContour(
  inside: (x: number, y: number) => boolean,
  startX: number,
  startY: number,
  maxSteps: number,
): Ring {
  const contour: Ring = [{ x: startX, y: startY }];
  let cx = startX;
  let cy = startY;
  let backtrack = 4;

  for (let step = 0; step < maxSteps; step++) {
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (backtrack + k) & 7;
      const nx = cx + OFFSETS[d].x;
      const ny = cy + OFFSETS[d].y;
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        backtrack = (d + 4) & 7;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (cx === startX && cy === startY) break;
    contour.push({ x: cx, y: cy });
  }

  return contour;
}

function firstPixelPerLabel(labeling: Labeling): Array<Point2D | undefined> {
  const { labels, width, height, count } = labeling;
  const firsts = new Array<Point2D | undefined>(count + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = labels[y * width + x];
      if (l !== 0 && firsts[l] === undefined) firsts[l] = { x, y };
    }
  }
  return firsts;
}

function assignHolesToForeground(
  foreground: Labeling,
  background: Labeling,
  validForeground: Set<number>,
): Map<number, number> {
  const { width, height } = foreground;
  const holeToFg = new Map<number, number>();

  const check = (fgLabel: number, bx: number, by: number) => {
    if (bx < 0 || by < 0 || bx >= width || by >= height) return;
    const bg = background.labels[by * width + bx];
    if (bg === 0 || background.touchesBorder[bg]) return;
    if (!holeToFg.has(bg)) holeToFg.set(bg, fgLabel);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fg = foreground.labels[y * width + x];
      if (fg === 0 || !validForeground.has(fg)) continue;
      check(fg, x - 1, y);
      check(fg, x + 1, y);
      check(fg, x, y - 1);
      check(fg, x, y + 1);
    }
  }

  return holeToFg;
}

function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function simplifyPolyline(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolyline(points.slice(0, index + 1), epsilon);
    const right = simplifyPolyline(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function simplifyRing(ring: Ring, epsilon: number): Ring {
  if (ring.length < 4) return ring.slice();
  const simplified = simplifyPolyline(ring.concat([ring[0]]), epsilon);
  simplified.pop();
  return simplified;
}

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function enforceWinding(ring: Ring, wantPositiveArea: boolean): Ring {
  return signedArea(ring) > 0 === wantPositiveArea ? ring : ring.slice().reverse();
}

export interface FootprintOptions {
  minComponentArea: number;
  minHoleArea: number;
  simplifyEpsilon: number;
}

export function extractWallFootprints(
  mask: BinaryMask,
  options: FootprintOptions,
): WallFootprint[] {
  const { width, height } = mask;
  const maxSteps = 4 * width * height;

  const foreground = labelComponents(mask, 1, 8);
  const background = labelComponents(mask, 0, 4);

  const validForeground = new Set<number>();
  for (let l = 1; l <= foreground.count; l++) {
    if (foreground.areas[l] >= options.minComponentArea) validForeground.add(l);
  }

  const fgFirst = firstPixelPerLabel(foreground);
  const bgFirst = firstPixelPerLabel(background);
  const holeToFg = assignHolesToForeground(foreground, background, validForeground);

  const holesByFg = new Map<number, number[]>();
  for (const [holeLabel, fgLabel] of holeToFg) {
    if (background.areas[holeLabel] < options.minHoleArea) continue;
    const list = holesByFg.get(fgLabel) ?? [];
    list.push(holeLabel);
    holesByFg.set(fgLabel, list);
  }

  const footprints: WallFootprint[] = [];

  for (const fgLabel of validForeground) {
    const start = fgFirst[fgLabel];
    if (!start) continue;

    const outerRaw = traceContour(
      (x, y) =>
        x >= 0 && y >= 0 && x < width && y < height &&
        foreground.labels[y * width + x] === fgLabel,
      start.x,
      start.y,
      maxSteps,
    );
    const outer = enforceWinding(simplifyRing(outerRaw, options.simplifyEpsilon), true);
    if (outer.length < 3) continue;

    const holes: Ring[] = [];
    for (const holeLabel of holesByFg.get(fgLabel) ?? []) {
      const hStart = bgFirst[holeLabel];
      if (!hStart) continue;
      const holeRaw = traceContour(
        (x, y) =>
          x >= 0 && y >= 0 && x < width && y < height &&
          background.labels[y * width + x] === holeLabel,
        hStart.x,
        hStart.y,
        maxSteps,
      );
      const hole = enforceWinding(simplifyRing(holeRaw, options.simplifyEpsilon), false);
      if (hole.length >= 3) holes.push(hole);
    }

    footprints.push({ outer, holes });
  }

  return footprints;
}
