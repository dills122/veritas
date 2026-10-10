/** Diagnostic package version; compilation identity will use a separate output version. */
export const VERSION = '0.1.0-rc.0';
export { compile } from './compiler/index.js';
export { plan } from './sync/plan.js';
export { createManifest } from './sync/manifest.js';
export { parseLibrary } from './parsing/library.js';
export { parseProjectConfig, parseLibraryManifest } from './config/parse.js';
export { createLocalSnapshot } from './sources/local.js';
export { loadSnapshot, storeSnapshot } from './sources/cache.js';
export { canonicalJson, sha256, treeDigest } from './model/hash.js';
export { PROFILES } from './adapters/profiles/index.js';
export { OUTPUT_VERSION, LIMITS, TARGET_IDS } from './model/types.js';
export type * from './model/types.js';
export type {
  ProjectConfig,
  LibraryManifest,
  SourceDescriptor,
} from './config/schemas.js';
