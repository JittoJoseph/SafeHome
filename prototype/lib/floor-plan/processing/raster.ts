export interface ImageDataLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface BinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createMask(width: number, height: number): BinaryMask {
  return { width, height, data: new Uint8Array(width * height) };
}

export function downsampleImage(
  image: ImageDataLike,
  maxDimension: number,
): { image: ImageDataLike; scale: number } {
  const largest = Math.max(image.width, image.height);
  if (largest <= maxDimension) return { image, scale: 1 };

  const scale = maxDimension / largest;
  const dstW = Math.max(1, Math.round(image.width * scale));
  const dstH = Math.max(1, Math.round(image.height * scale));
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  const sx = image.width / dstW;
  const sy = image.height / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor(dy * sy);
    const y1 = Math.min(image.height, Math.floor((dy + 1) * sy) || y0 + 1);
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor(dx * sx);
      const x1 = Math.min(image.width, Math.floor((dx + 1) * sx) || x0 + 1);

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const si = (y * image.width + x) * 4;
          r += image.data[si];
          g += image.data[si + 1];
          b += image.data[si + 2];
          a += image.data[si + 3];
          count++;
        }
      }
      const di = (dy * dstW + dx) * 4;
      dst[di] = r / count;
      dst[di + 1] = g / count;
      dst[di + 2] = b / count;
      dst[di + 3] = a / count;
    }
  }

  return { image: { data: dst, width: dstW, height: dstH }, scale };
}

function luminance(data: ImageDataLike["data"], i: number): number {
  if (data[i + 3] === 0) return 255;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function otsuThreshold(image: ImageDataLike): number {
  const hist = new Array(256).fill(0);
  const total = image.width * image.height;
  for (let p = 0; p < total; p++) {
    hist[Math.round(luminance(image.data, p * 4))]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

export function thresholdToMask(
  image: ImageDataLike,
  threshold?: number,
): BinaryMask {
  const cutoff = threshold ?? otsuThreshold(image);
  const mask = createMask(image.width, image.height);
  const total = image.width * image.height;

  let foreground = 0;
  for (let p = 0; p < total; p++) {
    if (luminance(image.data, p * 4) <= cutoff) {
      mask.data[p] = 1;
      foreground++;
    }
  }

  if (foreground > total / 2) {
    for (let p = 0; p < total; p++) mask.data[p] = mask.data[p] ? 0 : 1;
  }

  return mask;
}

type Reducer = (a: number, b: number) => number;

const MIN: Reducer = (a, b) => (a < b ? a : b);
const MAX: Reducer = (a, b) => (a > b ? a : b);

function separablePass(mask: BinaryMask, radius: number, reduce: Reducer): BinaryMask {
  const { width, height } = mask;
  const tmp = createMask(width, height);
  const out = createMask(width, height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = mask.data[row + x];
      for (let d = 1; d <= radius; d++) {
        const xl = x - d < 0 ? 0 : x - d;
        const xr = x + d >= width ? width - 1 : x + d;
        acc = reduce(acc, reduce(mask.data[row + xl], mask.data[row + xr]));
      }
      tmp.data[row + x] = acc;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = tmp.data[y * width + x];
      for (let d = 1; d <= radius; d++) {
        const yt = y - d < 0 ? 0 : y - d;
        const yb = y + d >= height ? height - 1 : y + d;
        acc = reduce(acc, reduce(tmp.data[yt * width + x], tmp.data[yb * width + x]));
      }
      out.data[y * width + x] = acc;
    }
  }

  return out;
}

function erode(mask: BinaryMask, radius: number): BinaryMask {
  return radius <= 0 ? mask : separablePass(mask, radius, MIN);
}

function dilate(mask: BinaryMask, radius: number): BinaryMask {
  return radius <= 0 ? mask : separablePass(mask, radius, MAX);
}

export function open(mask: BinaryMask, radius: number): BinaryMask {
  return radius <= 0 ? mask : dilate(erode(mask, radius), radius);
}

export function close(mask: BinaryMask, radius: number): BinaryMask {
  return radius <= 0 ? mask : erode(dilate(mask, radius), radius);
}
