import type { FogTile, TileOverview } from '../../shared/types';
export interface View {
  gcj?: boolean;
  left: number;
  top: number;
  world: number;
  width: number;
  height: number;
  zoom: number;
  id: number;
  pixelRatio?: number;
  pathWidth?: number;
}
export type RenderMessage =
  | { type: 'overview'; tiles: TileOverview[] }
  | { type: 'tile'; tile: FogTile }
  | { type: 'render'; view: View }
  | { type: 'clear' };
