/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as def_windward_jps from "def_windward_jps";

// Compile-only proof for the curated def-windward-jps native-extension namespace. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

const grid = def_windward_jps.create_grid(64, 64, [
  [10, 12],
  [11, 12],
]);

const [path, err] = grid.find_path([8, 8], [40, 40], "octile");
if (path !== undefined) {
  const _first: def_windward_jps.Point | undefined = path[0];
} else {
  const _message: string | undefined = err;
}

grid.find_path([1, 1], [2, 2]);
grid.find_path([1, 1], [2, 2], "manhattan");
grid.find_path([1, 1], [2, 2], "euclidean");

const _walkable: boolean = grid.is_walkable([15, 15]);

// @ts-expect-error the heuristic is one of "octile", "manhattan" and "euclidean".
grid.find_path([1, 1], [2, 2], "diagonal");
// @ts-expect-error `walls` is required; the extension checks it is a table.
def_windward_jps.create_grid(64, 64);
// @ts-expect-error a point is an `{x, y}` pair.
grid.is_walkable([1]);
// @ts-expect-error a failed search returns no path, so check before use.
const _unchecked: def_windward_jps.Point[] = grid.find_path([1, 1], [2, 2])[0];
