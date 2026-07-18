export interface Point2D {
  x: number;
  y: number;
}

export type Ring = Point2D[];

export interface WallFootprint {
  outer: Ring;
  holes: Ring[];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Floor {
  bounds: Bounds;
  textureDataUrl?: string;
}

export interface FloorPlanModel {
  imageWidth: number;
  imageHeight: number;
  floor: Floor;
  walls: WallFootprint[];
  pixelsPerMeter: number;
  wallHeightMeters: number;
  wallThicknessPx: number;
}
