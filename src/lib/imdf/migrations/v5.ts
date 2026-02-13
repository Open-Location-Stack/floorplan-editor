import type { ProjectSnapshot } from "../../types";

// Legacy checkpoint kept for backward compatibility in tests/import paths.
// New projects migrate with v7.
export const migrateProjectSnapshotToNavigationGraphV5 = (
  snapshot: ProjectSnapshot,
): ProjectSnapshot => ({
  ...snapshot,
  version: Math.max(snapshot.version, 6),
});
