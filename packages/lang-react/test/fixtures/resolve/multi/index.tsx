// biome-ignore-all lint/performance/noBarrelFile: barrel fixture for multi-star re-export (ADR-0016)
// biome-ignore lint/performance/noReExportAll: fixture exercises multi-`export *` resolution
export * from './first.js';
// biome-ignore lint/performance/noReExportAll: fixture exercises multi-`export *` resolution
export * from './second.js';
