/** @noSelfInFile */
/**
 * Finds paths on Recast/Detour navigation meshes and steers crowds of agents
 * along them. A mesh is loaded from a navmesh file built with Recast, and
 * each mesh keeps one crowd.
 *
 * @see {@link https://github.com/abadonna/defold-detour|Github Source}
 */
/** @globalTable */
declare module "detour" {
  /** One corner of a path returned by {@link NavMesh.find_path}. */
  interface PathPoint {
    /** Where the corner lies on the mesh. */
    position: Vector3;
    /** Area id of the polygon the corner lies on. */
    area: number;
    /** `true` on the corner the path starts from. */
    start?: true;
    /** `true` on the corner the path ends at. */
    end?: true;
    /** `true` on a corner that starts an off-mesh connection. */
    offmesh?: true;
  }

  /** An active agent, as {@link Crowd.update} reports it. */
  interface CrowdAgent {
    /** Where the agent is after the update. */
    position: Vector3;
    /** The agent's velocity after the update. */
    velocity: Vector3;
    /** `"walk"` on the mesh, `"offmesh"` on an off-mesh connection, else `"invalid"`. */
    state: "walk" | "offmesh" | "invalid";
  }

  /** The crowd of a mesh, returned by {@link NavMesh.create_crowd}. */
  interface Crowd {
    /**
     * Adds an agent at a position on the mesh.
     *
     * @param position - Where the agent starts.
     * @param radius - Radius of the agent.
     * @param height - Height of the agent.
     * @param max_acceleration - Largest change of velocity per second.
     * @param max_speed - Largest speed.
     * @param update_flags - Detour `dtUpdateFlags` to steer with: `1` anticipate
     * turns, `2` avoid obstacles, `4` keep apart from other agents, `8` optimize
     * the path by visibility, `16` optimize the path by topology.
     * @returns The agent id, or `-1` when the crowd already holds 128 agents.
     * **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    add_agent(
      position: Vector3,
      radius: number,
      height: number,
      max_acceleration: number,
      max_speed: number,
      update_flags: number,
    ): number;

    /**
     * Removes an agent from the crowd.
     *
     * @param agent - Id of the agent, as {@link Crowd.add_agent} returned it.
     * **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    remove_agent(agent: number): void;

    /**
     * Sends agents toward the point of the mesh nearest to `target`.
     *
     * @param target - Where to go.
     * @param agent - Id of the agent to send. When omitted, every active agent
     * is sent. **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    set_target(target: Vector3, agent?: number): void;

    /**
     * Stops agents moving toward their target.
     *
     * @param agent - Id of the agent to stop. When omitted, every agent is
     * stopped. **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    reset_target(agent?: number): void;

    /**
     * Moves every agent by one step of the simulation.
     *
     * @param dt - Time step in seconds.
     * @returns The active agents, keyed by agent id. Read them with `get` or
     * `pairs`: keys start at 0 and skip inactive agents, so this is not an
     * array. **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    update(dt: number): LuaTable<number, CrowdAgent>;
  }

  /** A navigation mesh returned by {@link detour.init}. */
  interface NavMesh {
    /**
     * Finds a path between the points of the mesh nearest to `start` and
     * `finish`. When `finish` cannot be reached, the path ends at the
     * reachable point nearest to it; when no path is found, the table is empty.
     *
     * @param start - Where to start from.
     * @param finish - Where to go.
     * @param straight_path_options - Detour `dtStraightPathOptions`: `1` adds a
     * corner where the path crosses into another area, `2` where it crosses
     * any polygon edge. Default is `0`.
     * @returns The corners of the path, in order. Read them with `get` or
     * `pairs`: keys start at 0, so this is not an array.
     * **0️⃣ 0-based; passed to `detour` unchanged.**
     */
    find_path(
      start: Vector3,
      finish: Vector3,
      straight_path_options?: number,
    ): LuaTable<number, PathPoint>;

    /**
     * Sets the cost of crossing each area. The defaults are `1` for areas 0, 2
     * and 3, `10` for area 1, `2` for area 4 and `1.5` for area 5.
     *
     * @param costs - Cost per area: `costs[0]` is the cost of area 0.
     */
    set_area_cost(costs: number[]): void;

    /**
     * Sets the polygon flags a path may cross. The default is every flag but
     * `0x10`, which marks disabled polygons.
     *
     * @param flags - Bit mask of polygon flags.
     */
    set_include_flags(flags: number): void;

    /**
     * Prepares the mesh's crowd for up to 128 agents. Calling it again resets
     * the same crowd.
     *
     * @param max_agent_radius - Radius of the largest agent the crowd will hold.
     * @returns The crowd.
     */
    create_crowd(max_agent_radius: number): Crowd;

    /** Frees the mesh and its crowd. Neither can be used after it. */
    delete(): void;
  }

  /**
   * Loads a navigation mesh.
   *
   * @param navmesh - The bytes of a Recast navmesh set file, such as
   * `sys.load_resource` returns.
   * @returns The mesh.
   */
  function init(navmesh: string): NavMesh;
}
