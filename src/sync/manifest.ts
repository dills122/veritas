import { compareOrdinal, sha256 } from '../model/hash.js';
import { OUTPUT_VERSION } from '../model/types.js';
import type { CompileResult, Manifest } from '../model/types.js';

/** Manifest identity depends only on effective compiler inputs and emitted artifacts. */
export function createManifest(result: CompileResult): Manifest {
  return {
    schemaVersion: 1,
    outputVersion: OUTPUT_VERSION,
    profiles: [...result.profiles].sort((a, b) => compareOrdinal(a.id, b.id)),
    inputDigest: result.inputDigest,
    adaptations: [...result.adaptations].sort(
      (a, b) =>
        compareOrdinal(a.rule, b.rule) ||
        compareOrdinal(a.target, b.target) ||
        compareOrdinal(a.kind, b.kind),
    ),
    artifacts: [...result.artifacts]
      .sort((a, b) => compareOrdinal(a.path, b.path))
      .map((artifact) => ({
        path: artifact.path,
        sha256: sha256(artifact.bytes),
        executable: artifact.executable,
        sourceIds: [...artifact.sourceIds].sort(compareOrdinal),
        consumers: [...artifact.consumers].sort(compareOrdinal),
      })),
  };
}
