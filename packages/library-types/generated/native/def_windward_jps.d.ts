/** @noSelfInFile */
declare global {
  /**
   * Finds paths on 2D grids with the Jump Point Search algorithm, moving in
   * eight directions. Each grid keeps its blocked cells in native memory, and
   * several grids can be used at once. Grid coordinates are 1-based.
   *
   * @see {@link https://github.com/s-kania/def-windward-jps|Github Source}
   */
  namespace def_windward_jps {
    /** A grid cell as `{x, y}`. Both coordinates are 1-based. */
    type Point = [x: number, y: number];

    /** How {@link Grid.find_path} estimates the remaining distance. */
    type Heuristic = "octile" | "manhattan" | "euclidean";

    /** A grid returned by {@link def_windward_jps.create_grid}. */
    interface Grid {
      /**
       * Finds a path between two cells. A start or goal that is outside the
       * grid or blocked, or a goal that cannot be reached, fails with an error
       * message instead of a path, so check `path` before reading it.
       *
       * @param start - Cell to start from. **⚠️ 1-based; passed to `def_windward_jps` unchanged.**
       * @param goal - Cell to reach. **⚠️ 1-based; passed to `def_windward_jps` unchanged.**
       * @param heuristic - Distance estimate to search with. Default is `"octile"`.
       * @returns `path`, the cells from start to goal, and `nil`; or `nil` and
       * `message`, why the search failed.
       *
       * **⚠️ `path` is 1-based; passed to `def_windward_jps` unchanged.**
       */
      find_path(
        start: Point,
        goal: Point,
        heuristic?: Heuristic,
      ): LuaMultiReturn<[Point[], undefined] | [undefined, string]>;

      /**
       * Whether a cell is inside the grid and not blocked. Use it to check a
       * cell before searching from or to it.
       *
       * @param point - Cell to check. **⚠️ 1-based; passed to `def_windward_jps` unchanged.**
       * @returns `true` if the cell can be walked through.
       */
      is_walkable(point: Point): boolean;
    }

    /**
     * Creates a grid to find paths on.
     *
     * @param width - Number of cells horizontally.
     * @param height - Number of cells vertically.
     * @param walls - Blocked cells, such as `[[10, 12], [11, 12]]`. **⚠️ 1-based; passed to `def_windward_jps` unchanged.**
     * @returns The new grid.
     */
    function create_grid(width: number, height: number, walls: Point[]): Grid;
  }
}

export {};
