import type { View } from './types';

export function worldCopies(view: View): number[] {
  const start = Math.floor(view.left / view.world) - 1;
  const end = Math.floor((view.left + view.width) / view.world) + 1;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function tileVisible(x: number, y: number, view: View): boolean {
  const size = view.world / 512;
  const pad = view.gcj ? view.world * 0.00006 : 0;
  return (
    y * size <= view.top + view.height + pad &&
    (y + 1) * size >= view.top - pad &&
    worldCopies(view).some(
      (w) =>
        x * size + w * view.world <= view.left + view.width + pad &&
        (x + 1) * size + w * view.world >= view.left - pad,
    )
  );
}

// Reproject the most recent mask while the render worker prepares a newer frame.
// This keeps explored areas attached to their actual location during pan and zoom.
export function maskTransform(frame: View, current: View) {
  let dx = current.left / current.world - frame.left / frame.world;
  if (current.width < current.world && frame.width < frame.world) dx -= Math.round(dx);
  return {
    scale: [
      ((current.width / frame.width) * frame.world) / current.world,
      ((current.height / frame.height) * frame.world) / current.world,
    ] as [number, number],
    offset: [
      (dx * frame.world) / frame.width,
      ((current.top / current.world) * frame.world - frame.top) / frame.height,
    ] as [number, number],
  };
}
