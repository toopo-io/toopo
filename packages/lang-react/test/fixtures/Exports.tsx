// biome-ignore-all lint/performance/noBarrelFile: fixture exercises re-export extraction (ADR-0016)
import { Base } from './Base';

export function Widget() {
  return <Base />;
}

export const helper = () => 1;

const internal = () => 2;

export { internal as renamedInternal };

export default Widget;

// biome-ignore lint/performance/noReExportAll: fixture exercises `export *` star re-export
export * from './all';
export { Alpha as Beta } from './greek';
export { Thing } from './Thing';
// biome-ignore lint/performance/noReExportAll: fixture exercises `export * as ns` namespace re-export
export * as utils from './utils';
