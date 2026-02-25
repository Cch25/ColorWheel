export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HsvColor {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export interface WheelPosition {
  x: number;
  y: number;
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;

  if      (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }

  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if      (max === rn) h = ((gn - bn) / delta + 6) % 6 * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else                 h = ((rn - gn) / delta + 4) * 60;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function applyShade(color: RgbColor, amount: number): RgbColor {
  let { r, g, b } = color;
  if (amount < 0) {
    const f = 1 + amount / 50;
    r *= f; g *= f; b *= f;
  } else {
    r += (255 - r) * (amount / 50);
    g += (255 - g) * (amount / 50);
    b += (255 - b) * (amount / 50);
  }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

export function hueSatToWheelPos(hue: number, sat: number, size: number): WheelPosition {
  const radius = size / 2;
  const angle = (hue - 90) * Math.PI / 180;
  return {
    x: radius + Math.cos(angle) * sat * radius,
    y: radius + Math.sin(angle) * sat * radius,
  };
}

export function wheelPosToHue(x: number, y: number, size: number): number {
  const radius = size / 2;
  const angle = Math.atan2(y - radius, x - radius);
  return ((angle * 180 / Math.PI) + 90 + 360) % 360;
}

export function wheelPosToSat(x: number, y: number, size: number): number {
  const radius = size / 2;
  const dx = x - radius, dy = y - radius;
  return Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius);
}

export function drawColorWheel(ctx: CanvasRenderingContext2D, size: number): void {
  const radius = size / 2;
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - radius, dy = y - radius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 90 + 360) % 360;
        const { r, g, b } = hsvToRgb(hue, dist / radius, 1);
        const i = (y * size + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
