// Display-only WGS84 -> GCJ-02 transform. Source data and area calculations stay WGS84.
export function toGcj(lng: number, lat: number): [number, number] {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lng, lat];
  const x = lng - 105,
    y = lat - 35,
    pi = Math.PI;
  const common = ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
  let dy = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)) + common;
  dy += ((20 * Math.sin(y * pi) + 40 * Math.sin((y * pi) / 3)) * 2) / 3;
  dy += ((160 * Math.sin((y * pi) / 12) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
  let dx = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)) + common;
  dx += ((20 * Math.sin(x * pi) + 40 * Math.sin((x * pi) / 3)) * 2) / 3;
  dx += ((150 * Math.sin((x * pi) / 12) + 300 * Math.sin((x * pi) / 30)) * 2) / 3;
  const r = (lat * pi) / 180,
    magic = 1 - 0.006693421622965943 * Math.sin(r) ** 2;
  return [
    lng + (dx * 180) / ((6378245 / Math.sqrt(magic)) * Math.cos(r) * pi),
    lat + (dy * 180) / (((6378245 * (1 - 0.006693421622965943)) / (magic * Math.sqrt(magic))) * pi),
  ];
}
export function fromGcj(lng: number, lat: number): [number, number] {
  let x = lng,
    y = lat;
  for (let i = 0; i < 5; i++) {
    const p = toGcj(x, y);
    x += lng - p[0];
    y += lat - p[1];
  }
  return [x, y];
}
export function mercator(lng: number, lat: number): [number, number] {
  const r = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2];
}
export function lngLat(x: number, y: number): [number, number] {
  return [x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI];
}
export type ProjectPoint = (x: number, y: number) => [number, number];
export function tileProject(tx: number, ty: number): ProjectPoint {
  return (x, y) => {
    const ll = lngLat((tx * 8192 + x) / 2 ** 22, (ty * 8192 + y) / 2 ** 22);
    const p = mercator(...toGcj(...ll));
    return [p[0] * 2 ** 22 - tx * 8192, p[1] * 2 ** 22 - ty * 8192];
  };
}
