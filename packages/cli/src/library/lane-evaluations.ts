import { fileURLToPath } from "node:url";

// The markdown and OpenAPI lanes' `no-go` evaluations: each lane's targets, its
// pinned upstream snapshots under `fixtures/`, and the `api-doc/` and `fidelity/`
// reports they lower to. They are parser fixtures, not library data, so no
// `--data` folder holds them. Target `apiDoc` and `fidelity` paths are relative
// to this root.
export const LANE_EVALUATIONS_ROOT = fileURLToPath(
  new URL("../../test/fixtures/lane-evaluations", import.meta.url),
);
