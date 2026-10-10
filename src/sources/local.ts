import { treeDigest } from '../model/hash.js';
import type { Snapshot } from '../model/types.js';
import { filesystemFailure, readSourceTree } from './snapshot.js';

export async function createLocalSnapshot(root: string): Promise<Snapshot> {
  try {
    const { files } = await readSourceTree(root, true);
    return { treeDigest: treeDigest(files), files };
  } catch (cause: unknown) {
    throw filesystemFailure(cause, root);
  }
}
