/** @noSelfInFile */
declare global {
  /**
   * Dynamic AABB trees for broad-phase collision queries and ray casts, grouped
   * into independent trees. Game objects inserted into a group follow their
   * position automatically.
   *
   * @see {@link https://github.com/selimanac/defold-daabbcc|Github Source}
   */
  namespace daabbcc {
    /** One overlapping AABB when `get_bits` is set: its id and category bits. */
    interface BitsHit {
      /** The AABB ID. */
      id: number;
      /** The category bits the AABB was inserted with. */
      category_bits: number;
    }

    /** One overlapping AABB from a sorted query or ray cast: its id, distance and category bits. */
    interface SortedHit extends BitsHit {
      /** Distance from the query or ray origin. */
      distance: number;
    }

    /** One overlapping AABB when `get_manifold` is set: a sorted hit plus its collision manifold. */
    interface ManifoldHit extends SortedHit {
      /** Penetration depth. */
      depth: number;
      /** Contact point X. */
      contact_point_x: number;
      /** Contact point Y. */
      contact_point_y: number;
      /** Collision normal X. */
      normal_x: number;
      /** Collision normal Y. */
      normal_y: number;
    }

    /**
     * The result of an unsorted query or ray cast: plain AABB IDs, or entries
     * with category bits (`get_bits`) or a full manifold (`get_manifold`).
     */
    type QueryResult = number[] | BitsHit[] | ManifoldHit[];

    /**
     * The result of a sorted query or ray cast, ordered from closest to
     * farthest: IDs with distances, or entries with category bits (`get_bits`)
     * or a full manifold (`get_manifold`).
     */
    type SortedQueryResult = SortedHit[] | BitsHit[] | ManifoldHit[];

    /** No rebuild. Default. */
    const UPDATE_INCREMENTAL: number;
    /** Full rebuild. */
    const UPDATE_FULLREBUILD: number;
    /** Partial rebuild. Recommended for lots of moving AABBs. */
    const UPDATE_PARTIALREBUILD: number;

    /**
     * New empty group for AABBs. Every group is a separate dynamic tree.
     *
     * @param rebuild_type - How the tree is rebuilt after each update of moving game object positions: `UPDATE_INCREMENTAL` (default), `UPDATE_FULLREBUILD` or `UPDATE_PARTIALREBUILD`.
     * @returns New group ID.
     */
    function new_group(rebuild_type?: number): number;

    /**
     * Removes the group and all associated AABBs and game objects.
     *
     * @param group_id - Group ID.
     */
    function remove_group(group_id: number): void;

    /**
     * Insert an AABB into the group.
     *
     * @param group_id - Group ID.
     * @param x - X position of the AABB.
     * @param y - Y position of the AABB.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     * @param category_bit - Single category bit the AABB belongs to. Default is all.
     * @returns New AABB ID.
     */
    function insert_aabb(
      group_id: number,
      x: number,
      y: number,
      width: number,
      height: number,
      category_bit?: number,
    ): number;

    /**
     * Insert a game object and its associated AABB into a group. Most suitable
     * for constantly moving game objects; use `insert_aabb` for static ones.
     *
     * @param group_id - Group ID.
     * @param go_url - The game object.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     * @param category_bit - Single category bit the AABB belongs to. Default is all.
     * @param get_world_position - Use the game object's world position. Default is `false`.
     * @returns New AABB ID.
     */
    function insert_gameobject(
      group_id: number,
      go_url: SceneGameObjectAddress | Hash | Url,
      width: number,
      height: number,
      category_bit?: number,
      get_world_position?: boolean,
    ): number;

    /**
     * Updates the AABB position and size. Does not affect game objects, whose
     * AABB positions are overwritten by the internal update.
     *
     * @param group_id - Group ID.
     * @param aabb_id - AABB ID.
     * @param x - X position of the AABB.
     * @param y - Y position of the AABB.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     */
    function update_aabb(
      group_id: number,
      aabb_id: number,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void;

    /**
     * Updates the size of a game object's AABB.
     *
     * @param group_id - Group ID.
     * @param aabb_id - AABB ID.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     */
    function update_gameobject_size(
      group_id: number,
      aabb_id: number,
      width: number,
      height: number,
    ): void;

    /**
     * Removes the AABB and its game object from the group.
     *
     * @param group_id - Group ID.
     * @param aabb_id - AABB ID.
     */
    function remove(group_id: number, aabb_id: number): void;

    /**
     * Query possible overlaps using a raw AABB.
     *
     * @param group_id - Group ID.
     * @param x - X position of the AABB.
     * @param y - Y position of the AABB.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The overlapping AABBs, or `undefined` when there are none, and their count.
     */
    function query_aabb(
      group_id: number,
      x: number,
      y: number,
      width: number,
      height: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[QueryResult | undefined, number]>;

    /**
     * Query possible overlaps using an AABB ID.
     *
     * @param group_id - Group ID.
     * @param aabb_id - AABB ID.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The overlapping AABBs, or `undefined` when there are none, and their count.
     */
    function query_id(
      group_id: number,
      aabb_id: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[QueryResult | undefined, number]>;

    /**
     * Query possible overlaps using a raw AABB, ordered from closest to farthest.
     *
     * @param group_id - Group ID.
     * @param x - X position of the AABB.
     * @param y - Y position of the AABB.
     * @param width - Width of the AABB.
     * @param height - Height of the AABB.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The overlapping AABBs, or `undefined` when there are none, and their count.
     */
    function query_aabb_sort(
      group_id: number,
      x: number,
      y: number,
      width: number,
      height: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[SortedQueryResult | undefined, number]>;

    /**
     * Query possible overlaps using an AABB ID, ordered from closest to farthest.
     *
     * @param group_id - Group ID.
     * @param aabb_id - AABB ID.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The overlapping AABBs, or `undefined` when there are none, and their count.
     */
    function query_id_sort(
      group_id: number,
      aabb_id: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[SortedQueryResult | undefined, number]>;

    /**
     * Perform a ray cast against the group.
     *
     * @param group_id - Group ID.
     * @param start_x - Ray start X.
     * @param start_y - Ray start Y.
     * @param end_x - Ray end X.
     * @param end_y - Ray end Y.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The hit AABBs, or `undefined` when there are none, and their count.
     */
    function raycast(
      group_id: number,
      start_x: number,
      start_y: number,
      end_x: number,
      end_y: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[QueryResult | undefined, number]>;

    /**
     * Perform a ray cast against the group, ordered from closest to farthest.
     *
     * @param group_id - Group ID.
     * @param start_x - Ray start X.
     * @param start_y - Ray start Y.
     * @param end_x - Ray end X.
     * @param end_y - Ray end Y.
     * @param mask_bits - Default is all.
     * @param get_manifold - Include the collision manifold. Default is `false`.
     * @param get_bits - Include category bits without manifold generation. Default is `false`.
     * @returns The hit AABBs, or `undefined` when there are none, and their count.
     */
    function raycast_sort(
      group_id: number,
      start_x: number,
      start_y: number,
      end_x: number,
      end_y: number,
      mask_bits?: number,
      get_manifold?: boolean,
      get_bits?: boolean,
    ): LuaMultiReturn<[SortedQueryResult | undefined, number]>;

    /**
     * Pause or resume the internal game object position update. Enabled by
     * default; it does not iterate when no game objects are registered.
     *
     * @param state - `true` to resume, `false` to pause.
     */
    function run(state: boolean): void;

    /**
     * Set an independent frequency for the game object position update. The
     * default is the project's `display.frequency`.
     *
     * @param frequency - Update frequency.
     */
    function update_frequency(frequency: number): void;

    /**
     * Partially or fully rebuild a group.
     *
     * @param group_id - Group ID.
     * @param full_build - `true` for a full rebuild, `false` for a partial one.
     */
    function rebuild(group_id: number, full_build: boolean): void;

    /**
     * Partially or fully rebuild all groups.
     *
     * The runtime reads the flag from the second argument, so pass `undefined`
     * first.
     *
     * @param _unused - Ignored by the runtime.
     * @param full_build - `true` for a full rebuild, `false` for a partial one.
     */
    function rebuild_all(_unused: undefined, full_build: boolean): void;

    /**
     * Removes all AABBs, groups and game objects, resetting to the initial state.
     * Recommended when you are done with it, such as when a level ends.
     */
    function reset(): void;
  }
}

export {};
