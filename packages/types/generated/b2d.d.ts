/** @noSelfInFile */
import type { Hash, Opaque, Url, Vector3 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with Box2D.
   */
  namespace b2d {
    /**
     * Box2D axis-aligned bounding box
     */
    interface aabb {
      /**
       * Lower bound.
       */
      lower: Vector3;
      /**
       * Upper bound.
       */
      upper: Vector3;
    }
    type b2Body = Opaque<"b2Body">;
    type b2World = Opaque<"b2World">;
    /**
     * Box2D 3.x chain definition
     */
    interface chain_definition {
      /**
       * Chain vertices.
       */
      vertices: Vector3[];
      /**
       * Whether the chain is closed.
       */
      loop?: boolean;
      /**
       * Ghost vertex preceding an open chain.
       */
      prev_vertex?: Vector3;
      /**
       * Ghost vertex following an open chain.
       */
      next_vertex?: Vector3;
      /**
       * Segment friction.
       */
      friction?: number;
      /**
       * Segment restitution.
       */
      restitution?: number;
      /**
       * Segment material identifier.
       */
      material?: number;
      /**
       * Collision filter fields to override.
       */
      filter?: b2d.filter_options;
      /**
       * Whether to enable sensor events.
       */
      enable_sensor_events?: boolean;
    }
    /**
     * Box2D chain geometry
     */
    interface chain_geometry {
      /**
       * Whether the chain is closed.
       */
      loop: boolean;
      /**
       * Number of chain segments.
       */
      segment_count: number;
      /**
       * Chain vertices.
       */
      vertices: Vector3[];
      /**
       * Ghost vertex preceding an open chain.
       */
      prev_vertex?: Vector3;
      /**
       * Ghost vertex following an open chain.
       */
      next_vertex?: Vector3;
    }
    /**
     * Box2D contact data
     */
    interface contact_data {
      /**
       * First contact shape.
       */
      shape_a: b2d.shape_info;
      /**
       * Second contact shape.
       */
      shape_b: b2d.shape_info;
      /**
       * Contact normal.
       */
      normal: Vector3;
      /**
       * Rolling resistance impulse.
       */
      rolling_impulse: number;
      /**
       * Number of manifold points.
       */
      point_count: number;
      /**
       * Contact manifold points.
       */
      points: b2d.contact_point[];
    }
    /**
     * Box2D contact manifold point
     */
    interface contact_point {
      /**
       * World contact point.
       */
      point: Vector3;
      /**
       * Contact anchor on the first body.
       */
      anchor_a: Vector3;
      /**
       * Contact anchor on the second body.
       */
      anchor_b: Vector3;
      /**
       * Contact separation.
       */
      separation: number;
      /**
       * Normal impulse.
       */
      normal_impulse: number;
      /**
       * Tangent impulse.
       */
      tangent_impulse: number;
      /**
       * Total normal impulse.
       */
      total_normal_impulse: number;
      /**
       * Relative normal velocity.
       */
      normal_velocity: number;
      /**
       * Contact point identifier.
       */
      id: number;
      /**
       * Whether the point persisted from the previous step.
       */
      persisted: boolean;
    }
    /**
     * Box2D explosion definition
     */
    interface explosion_definition {
      /**
       * Explosion center.
       */
      position: Vector3;
      /**
       * Explosion radius.
       */
      radius: number;
      /**
       * Distance over which the impulse falls off.
       */
      falloff: number;
      /**
       * Impulse applied per unit length.
       */
      impulse_per_length: number;
      /**
       * Optional collision mask.
       */
      mask_bits?: number;
    }
    /**
     * Box2D collision filter
     */
    interface filter {
      /**
       * Collision category bits.
       */
      category_bits: number;
      /**
       * Collision mask bits.
       */
      mask_bits: number;
      /**
       * Collision group index.
       */
      group_index: number;
    }
    /**
     * Partial Box2D collision filter
     */
    interface filter_options {
      /**
       * Collision category bits.
       */
      category_bits?: number;
      /**
       * Collision mask bits.
       */
      mask_bits?: number;
      /**
       * Collision group index.
       */
      group_index?: number;
    }
    /**
     * Box2D 2.x cast hit
     */
    interface fixture_cast_hit {
      /**
       * Hit fixture.
       */
      fixture: b2d.fixture_info;
      /**
       * Hit fixture child shape.
       */
      shape: b2d.fixture_info;
      /**
       * Hit point.
       */
      point: Vector3;
      /**
       * Hit normal.
       */
      normal: Vector3;
      /**
       * Hit fraction.
       */
      fraction: number;
      /**
       * Number of tree nodes visited by a closest query.
       */
      node_visits?: number;
      /**
       * Number of tree leaves visited by a closest query.
       */
      leaf_visits?: number;
    }
    /**
     * Box2D 2.x fixture definition
     */
    interface fixture_definition {
      /**
       * Shape definition.
       */
      shape: b2d.shape.definition;
      /**
       * Fixture friction.
       */
      friction?: number;
      /**
       * Fixture restitution.
       */
      restitution?: number;
      /**
       * Fixture density.
       */
      density?: number;
      /**
       * Whether the fixture is a sensor.
       */
      sensor?: boolean;
      /**
       * Alias for `sensor`.
       */
      is_sensor?: boolean;
      /**
       * Collision filter.
       */
      filter?: b2d.filter;
    }
    /**
     * Box2D 2.x fixture information
     */
    interface fixture_info {
      /**
       * Owning body, when returned from a world query.
       */
      body?: Opaque<"b2Body">;
      /**
       * Fixture index on the body.
       */
      index: number;
      /**
       * Child-shape index, when returned from a world query.
       */
      child_index?: number;
      /**
       * Shape type.
       */
      type: b2d.shape.SHAPE_TYPE;
      /**
       * Whether the fixture is a sensor.
       */
      sensor: boolean;
      /**
       * Fixture density.
       */
      density: number;
      /**
       * Fixture friction.
       */
      friction: number;
      /**
       * Fixture restitution.
       */
      restitution: number;
      /**
       * Number of child shapes.
       */
      child_count: number;
    }
    /**
     * Mass properties for a Box2D body or shape.
     */
    interface mass_data {
      /**
       * Body mass, usually in kilograms.
       */
      mass: number;
      /**
       * Local center of mass.
       */
      center: Vector3;
      /**
       * Rotational inertia about the local origin.
       */
      inertia: number;
    }
    /**
     * Box2D mover capsule
     */
    interface mover_capsule {
      /**
       * First capsule center.
       */
      center1: Vector3;
      /**
       * Second capsule center.
       */
      center2: Vector3;
      /**
       * Capsule radius.
       */
      radius: number;
    }
    /**
     * Box2D mover collision plane
     */
    interface mover_plane {
      /**
       * Colliding shape.
       */
      shape: b2d.shape_info;
      /**
       * Plane normal.
       */
      normal: Vector3;
      /**
       * Plane offset.
       */
      offset: number;
      /**
       * Whether the mover hit the plane.
       */
      hit: boolean;
    }
    /**
     * Box2D world-query filter
     */
    interface query_filter {
      /**
       * Optional collision category bits.
       */
      category_bits?: number;
      /**
       * Optional collision mask bits.
       */
      mask_bits?: number;
      /**
       * Optional collision group index. Supported by the Box2D 2.x backend.
       */
      group_index?: number;
    }
    /**
     * Box2D 3.x cast hit
     */
    interface shape_cast_hit {
      /**
       * Hit shape.
       */
      shape: b2d.shape_info;
      /**
       * Hit point.
       */
      point: Vector3;
      /**
       * Hit normal.
       */
      normal: Vector3;
      /**
       * Hit fraction.
       */
      fraction: number;
      /**
       * Number of tree nodes visited by a closest query.
       */
      node_visits?: number;
      /**
       * Number of tree leaves visited by a closest query.
       */
      leaf_visits?: number;
    }
    /**
     * Direct Box2D shape cast result
     */
    interface shape_cast_output {
      /**
       * Hit point.
       */
      point: Vector3;
      /**
       * Hit normal.
       */
      normal: Vector3;
      /**
       * Hit fraction.
       */
      fraction: number;
      /**
       * Number of cast iterations.
       */
      iterations: number;
    }
    type shape_create_definition = { shape: b2d.shape.definition; density?: number; friction?: number; restitution?: number; material?: number; sensor?: boolean; is_sensor?: boolean; filter?: b2d.filter } | { type: b2d.shape.SHAPE_TYPE; radius?: number; center?: Vector3; center1?: Vector3; center2?: Vector3; v0?: Vector3; v1?: Vector3; v2?: Vector3; v3?: Vector3; hx?: number; hy?: number; angle?: number; vertices?: Vector3[]; density?: number; friction?: number; restitution?: number; material?: number; sensor?: boolean; is_sensor?: boolean; filter?: b2d.filter };
    /**
     * Box2D 3.x shape information
     */
    interface shape_info {
      /**
       * Shape index on the body.
       */
      index: number;
      /**
       * Shape handle.
       */
      shape_id: Opaque<"b2Shape">;
      /**
       * Shape type.
       */
      type: b2d.shape.SHAPE_TYPE;
      /**
       * Whether the shape is a sensor.
       */
      sensor: boolean;
      /**
       * Shape density.
       */
      density: number;
      /**
       * Shape friction.
       */
      friction: number;
      /**
       * Shape restitution.
       */
      restitution: number;
      /**
       * Shape material identifier.
       */
      material: number;
      /**
       * Number of child shapes.
       */
      child_count: number;
      /**
       * Whether the shape belongs to a chain.
       */
      is_chain_segment: boolean;
    }
    /**
     * World transform for a Box2D body.
     */
    interface transform {
      /**
       * World position of the body origin.
       */
      position: Vector3;
      /**
       * World rotation angle in radians.
       */
      angle: number;
    }
    /**
     * Box2D broad-phase query statistics
     */
    interface tree_stats {
      /**
       * Number of tree nodes visited.
       */
      node_visits: number;
      /**
       * Number of tree leaves visited.
       */
      leaf_visits: number;
    }
    /**
     * Box2D version information
     */
    interface version_info {
      /**
       * Full Box2D version string.
       */
      version: string;
      /**
       * Major version number.
       */
      major: number;
      /**
       * Middle version number.
       */
      middle: number;
      /**
       * Minor version number.
       */
      minor: number;
    }
    /**
     * Box2D world counters
     */
    interface world_counters {
      /**
       * Number of bodies.
       */
      body_count: number;
      /**
       * Number of shapes.
       */
      shape_count: number;
      /**
       * Number of contacts.
       */
      contact_count: number;
      /**
       * Number of joints.
       */
      joint_count: number;
      /**
       * Number of islands.
       */
      island_count: number;
      /**
       * Stack bytes in use.
       */
      stack_used: number;
      /**
       * Static broad-phase tree height.
       */
      static_tree_height: number;
      /**
       * Dynamic broad-phase tree height.
       */
      tree_height: number;
      /**
       * Allocated byte count.
       */
      byte_count: number;
      /**
       * Number of tasks.
       */
      task_count: number;
      /**
       * Constraint graph color counts.
       */
      color_counts: number[];
    }
    /**
     * Box2D world profiling data
     */
    interface world_profile {
      /**
       * Total step time.
       */
      step: number;
      /**
       * Pair update time.
       */
      pairs: number;
      /**
       * Collision time.
       */
      collide: number;
      /**
       * Solver time.
       */
      solve: number;
      /**
       * Island merge time.
       */
      merge_islands: number;
      /**
       * Stage preparation time.
       */
      prepare_stages: number;
      /**
       * Constraint solver time.
       */
      solve_constraints: number;
      /**
       * Constraint preparation time.
       */
      prepare_constraints: number;
      /**
       * Velocity integration time.
       */
      integrate_velocities: number;
      /**
       * Warm-start time.
       */
      warm_start: number;
      /**
       * Impulse solver time.
       */
      solve_impulses: number;
      /**
       * Position integration time.
       */
      integrate_positions: number;
      /**
       * Impulse relaxation time.
       */
      relax_impulses: number;
      /**
       * Restitution time.
       */
      apply_restitution: number;
      /**
       * Impulse storage time.
       */
      store_impulses: number;
      /**
       * Island splitting time.
       */
      split_islands: number;
      /**
       * Transform update time.
       */
      transforms: number;
      /**
       * Hit-event generation time.
       */
      hit_events: number;
      /**
       * Tree refit time.
       */
      refit: number;
      /**
       * Bullet processing time.
       */
      bullets: number;
      /**
       * Island sleeping time.
       */
      sleep_islands: number;
      /**
       * Sensor processing time.
       */
      sensors: number;
    }
    /**
     * Get the Box2D body from a collision object
     *
     * @param url - the url to the game object collision component
     * @returns the body if successful. Otherwise `nil`.
     */
    function get_body(url: string | Hash | Url): Opaque<"b2Body"> | undefined;
    /**
     * Get the Box2D version information for the active backend.
     *
     * @returns version information
     */
    function get_version(): b2d.version_info;
    /**
     * Get the Box2D world from the current collection
     *
     * @returns the world if successful. Otherwise `nil`.
     */
    function get_world(): Opaque<"b2World"> | undefined;
  }
}

export {};
