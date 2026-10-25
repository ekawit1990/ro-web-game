/** Isometric projection: world tiles (x, y) <-> screen pixels. Tiles are 64x32 diamonds. */
export const TW = 64;
export const TH = 32;

export class Iso {
  constructor(private mapH: number) {}

  /** Screen position of a world point (tile units, floats ok). */
  toScreen(x: number, y: number) {
    return { x: (x - y) * (TW / 2) + this.mapH * (TW / 2), y: (x + y) * (TH / 2) };
  }

  /** World position (tile units) of a screen point. */
  toWorld(sx: number, sy: number) {
    const a = (sx - this.mapH * (TW / 2)) / (TW / 2);
    const b = sy / (TH / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
}
