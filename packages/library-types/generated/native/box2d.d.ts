/** @noSelfInFile */
declare global {
  /**
   * Box2D 2.4.1 physics: worlds, bodies, fixtures, shapes and joints, with the
   * names and calls of the C++ API. Box2D works in meters, kilograms and
   * radians; positions and vectors are passed as `vmath.vector3`, of which only
   * `x` and `y` are read.
   *
   * The extension replaces Defold's own Box2D, so a project that uses it can
   * have no collision object components. A world, its debug draw and its
   * listeners live until `Destroy` is called on them.
   *
   * @see {@link https://github.com/d954mas/defold-box2d|Github Source}
   */
  namespace box2d {
    /** Shape types, as {@link Shape.GetType} and {@link Fixture.GetType} return them. */
    namespace b2Shape {
      const e_circle: 0;
      const e_edge: 1;
      const e_polygon: 2;
      const e_chain: 3;
    }

    /** A {@link b2Shape} value. */
    type ShapeType =
      | typeof b2Shape.e_circle
      | typeof b2Shape.e_edge
      | typeof b2Shape.e_polygon
      | typeof b2Shape.e_chain;

    /** Body types. */
    namespace b2BodyType {
      /** Zero mass, zero velocity; may be moved by hand. */
      const b2_staticBody: 0;
      /** Zero mass, velocity set by the user, moved by the solver. */
      const b2_kinematicBody: 1;
      /** Positive mass, velocity determined by forces, moved by the solver. */
      const b2_dynamicBody: 2;
    }

    /** A {@link b2BodyType} value. */
    type BodyType =
      | typeof b2BodyType.b2_staticBody
      | typeof b2BodyType.b2_kinematicBody
      | typeof b2BodyType.b2_dynamicBody;

    /**
     * Joint types, as {@link Joint.GetType} returns them and a joint
     * definition's `type` names them. `e_unknownJoint` and `e_ropeJoint` cannot
     * be created.
     */
    namespace b2JointType {
      const e_unknownJoint: 0;
      const e_revoluteJoint: 1;
      const e_prismaticJoint: 2;
      const e_distanceJoint: 3;
      const e_pulleyJoint: 4;
      const e_mouseJoint: 5;
      const e_gearJoint: 6;
      const e_wheelJoint: 7;
      const e_weldJoint: 8;
      const e_frictionJoint: 9;
      const e_ropeJoint: 10;
      const e_motorJoint: 11;
    }

    /** A {@link b2JointType} value. */
    type JointType =
      | typeof b2JointType.e_unknownJoint
      | typeof b2JointType.e_revoluteJoint
      | typeof b2JointType.e_prismaticJoint
      | typeof b2JointType.e_distanceJoint
      | typeof b2JointType.e_pulleyJoint
      | typeof b2JointType.e_mouseJoint
      | typeof b2JointType.e_gearJoint
      | typeof b2JointType.e_wheelJoint
      | typeof b2JointType.e_weldJoint
      | typeof b2JointType.e_frictionJoint
      | typeof b2JointType.e_ropeJoint
      | typeof b2JointType.e_motorJoint;

    /** Debug draw flags. They combine as bits, so a flags slot takes their sum. */
    namespace b2Draw {
      /** Draw shapes. */
      const e_shapeBit: 1;
      /** Draw joint connections. */
      const e_jointBit: 2;
      /** Draw axis-aligned bounding boxes. */
      const e_aabbBit: 4;
      /** Draw broad-phase pairs. */
      const e_pairBit: 8;
      /** Draw the center of mass frame. */
      const e_centerOfMassBit: 16;
    }

    /** Contact manifold types. */
    namespace b2Manifold_Type {
      const e_circles: 0;
      const e_faceA: 1;
      const e_faceB: 2;
    }

    /** A {@link b2Manifold_Type} value. */
    type ManifoldType =
      | typeof b2Manifold_Type.e_circles
      | typeof b2Manifold_Type.e_faceA
      | typeof b2Manifold_Type.e_faceB;

    /** A point as a plain `{x, y}` table, not a `vector3`. */
    interface Vec2 {
      x: number;
      y: number;
    }

    /** A debug draw color, each channel from 0 to 1. */
    interface Color {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    /** A position and a rotation. */
    interface Transform {
      /** The position. */
      p: Vector3;
      /** The rotation angle in radians. */
      q: number;
    }

    /** An axis-aligned bounding box. */
    interface AABB {
      /** The lower vertex. */
      lowerBound: Vector3;
      /** The upper vertex. */
      upperBound: Vector3;
    }

    /** Ray-cast input. The ray extends from `p1` to `p1 + maxFraction * (p2 - p1)`. */
    interface RayCastInput {
      p1: Vector3;
      p2: Vector3;
      maxFraction: number;
    }

    /** Ray-cast output. The ray hits at `p1 + fraction * (p2 - p1)`. */
    interface RayCastOutput {
      normal: Vector3;
      fraction: number;
    }

    /** The mass properties of a body, fixture or shape. */
    interface MassData {
      /** The mass, usually in kilograms. */
      mass: number;
      /** The position of the center of mass relative to the shape origin. A plain `{x, y}` table. */
      center: Vec2;
      /** The rotational inertia about the local origin. */
      I: number;
    }

    /** Contact filtering data. Setting it requires all three fields. */
    interface Filter {
      /** The collision category bits. Normally one bit is set. */
      categoryBits: number;
      /** The categories this shape accepts for collision. */
      maskBits: number;
      /**
       * Objects in the same negative group never collide; in the same positive
       * group they always collide. Zero means no group. A non-zero group wins
       * over the mask bits.
       */
      groupIndex: number;
    }

    /** Time spent in each phase of the last step. */
    interface Profile {
      step: number;
      collide: number;
      solve: number;
      solveInit: number;
      solveVelocity: number;
      solvePosition: number;
      broadphase: number;
      solveTOI: number;
    }

    /** The features that intersect to form a contact point. */
    interface ContactFeature {
      /** Feature index on shape A. */
      indexA: number;
      /** Feature index on shape B. */
      indexB: number;
      /** The feature type on shape A: 0 for a vertex, 1 for a face. */
      typeA: number;
      /** The feature type on shape B: 0 for a vertex, 1 for a face. */
      typeB: number;
    }

    /** Identifies a contact point between two shapes, for warm starting. */
    interface ContactID {
      cf: ContactFeature;
      /** Used to compare contact ids quickly. */
      key: number;
    }

    /** A contact point of a manifold. */
    interface ManifoldPoint {
      /** Usage depends on the manifold type. */
      localPoint: Vector3;
      /** The non-penetration impulse. */
      normalImpulse: number;
      /** The friction impulse. */
      tangentImpulse: number;
      /** Identifies the contact point between the two shapes. */
      id: ContactID;
    }

    /**
     * A manifold for two touching convex shapes, in local coordinates. Its
     * points and normal mean different things for each {@link ManifoldType}.
     */
    interface Manifold {
      type: ManifoldType;
      /** Usage depends on the manifold type. */
      localPoint: Vector3;
      /** Not used for `e_circles`. */
      localNormal: Vector3;
      /** The number of manifold points. */
      pointCount: number;
      /** The points of contact. */
      points: ManifoldPoint[];
    }

    /** The current state of a contact manifold, in world coordinates. */
    interface WorldManifold {
      /** World vector pointing from A to B. */
      normal: Vector3;
      /** World contact points. */
      points: Vector3[];
      /** A negative value indicates overlap, in meters. */
      separations: number[];
    }

    /** Contact impulses, matching the manifold points one to one. */
    interface ContactImpulse {
      normalImpulses: number[];
      tangentImpulses: number[];
      count: number;
    }

    /** A circle, described as a table. */
    interface CircleShapeTable {
      shape: typeof b2Shape.e_circle;
      circle_radius: number;
      /** The center relative to the body origin. Default is the origin. */
      circle_position?: Vector3;
    }

    /** A one-sided edge with ghost vertices, described as a table. */
    interface OneSidedEdgeShapeTable {
      shape: typeof b2Shape.e_edge;
      edge_two_sided?: false;
      /** The vertex that precedes the edge. */
      edge_v0: Vector3;
      edge_v1: Vector3;
      edge_v2: Vector3;
      /** The vertex that follows the edge. */
      edge_v3: Vector3;
    }

    /** An isolated two-sided edge, described as a table. */
    interface TwoSidedEdgeShapeTable {
      shape: typeof b2Shape.e_edge;
      edge_two_sided: true;
      edge_v1: Vector3;
      edge_v2: Vector3;
    }

    /** A box polygon, described as a table. */
    interface BoxShapeTable {
      shape: typeof b2Shape.e_polygon;
      box: true;
      /** The half-width. */
      box_hx: number;
      /** The half-height. */
      box_hy: number;
      /** The center in local coordinates. Set it together with `box_angle` or not at all. */
      box_center?: Vector3;
      /** The rotation in radians. Set it together with `box_center` or not at all. */
      box_angle?: number;
    }

    /** A convex polygon, described as a table. */
    interface PolygonShapeTable {
      shape: typeof b2Shape.e_polygon;
      box?: false;
      /** From 3 to 8 points; their convex hull is used. */
      polygon_vertices: Vector3[];
    }

    /** A chain, described as a table. */
    interface ChainShapeTable {
      shape: typeof b2Shape.e_chain;
      chain_vertices: Vector3[];
      /** `true` closes the chain into a loop. */
      chain_loop?: boolean;
      /** The vertex that connects to the start. Required unless `chain_loop` is set. */
      chain_prev_vertex?: Vector3;
      /** The vertex that connects to the end. Required unless `chain_loop` is set. */
      chain_next_vertex?: Vector3;
    }

    /** A shape described as a table, accepted wherever a shape object is. */
    type ShapeTable =
      | CircleShapeTable
      | OneSidedEdgeShapeTable
      | TwoSidedEdgeShapeTable
      | BoxShapeTable
      | PolygonShapeTable
      | ChainShapeTable;

    /**
     * A shape object. Creating a fixture copies the shape, so changing it
     * afterwards does not change the fixture.
     */
    interface Shape {
      /**
       * Copies the shape.
       *
       * @returns A new shape of the same type.
       */
      Clone(): Shape;

      /**
       * Gets the type of this shape. Use it to tell which shape type the object is.
       *
       * @returns A {@link b2Shape} value.
       */
      GetType(): ShapeType;

      /**
       * Gets the number of child primitives.
       *
       * @returns The child count.
       */
      GetChildCount(): number;

      /**
       * Tests a point for containment in this shape. This only works for convex shapes.
       *
       * @param xf - The shape's world transform.
       * @param p - A point in world coordinates.
       * @returns `true` if the point is inside.
       */
      TestPoint(xf: Transform, p: Vector3): boolean;

      /**
       * Casts a ray against a child shape.
       *
       * @param input - The ray-cast input parameters.
       * @param transform - The transform applied to the shape.
       * @param childIndex - The child shape index. Circle, polygon and edge shapes have one child
       * and ignore it; a chain shape requires it. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The hit, or `nil` if the ray misses.
       */
      RayCast(
        input: RayCastInput,
        transform: Transform,
        childIndex?: number,
      ): RayCastOutput | undefined;

      /**
       * Computes the axis-aligned bounding box of a child shape.
       *
       * @param xf - The world transform of the shape.
       * @param childIndex - The child shape index. Circle, polygon and edge shapes have one child
       * and ignore it; a chain shape requires it. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The box.
       */
      ComputeAABB(xf: Transform, childIndex?: number): AABB;

      /**
       * Computes the mass properties of this shape from its dimensions and
       * density. The inertia is computed about the local origin.
       *
       * @param density - The density in kilograms per square meter.
       * @returns The mass data.
       */
      ComputeMass(density: number): MassData;

      /**
       * Gets the radius. For a polygon it is the polygon skin radius.
       *
       * @returns The radius.
       */
      GetRadius(): number;

      /**
       * Sets the radius.
       *
       * @param radius - The new radius.
       */
      SetRadius(radius: number): void;
    }

    /** A circle shape, from {@link box2d.NewCircleShape}. */
    interface CircleShape extends Shape {
      /**
       * Copies the shape.
       *
       * @returns A new circle shape.
       */
      Clone(): CircleShape;

      /**
       * Sets the center relative to the body origin.
       *
       * @param position - The center.
       */
      SetPosition(position: Vector3): void;

      /**
       * Gets the center relative to the body origin.
       *
       * @returns The center.
       */
      GetPosition(): Vector3;
    }

    /** A convex polygon shape, from {@link box2d.NewPolygonShape}. */
    interface PolygonShape extends Shape {
      /**
       * Copies the shape.
       *
       * @returns A new polygon shape.
       */
      Clone(): PolygonShape;

      /**
       * Creates a convex hull from local points. The points may be reordered,
       * and collinear points are kept, which can lead to poor stacking.
       *
       * @param points - From 3 to 8 points.
       */
      Set(points: Vector3[]): void;

      /**
       * Makes an axis-aligned box centered on the local origin.
       *
       * @param hx - The half-width.
       * @param hy - The half-height.
       */
      SetAsBox(hx: number, hy: number): void;

      /**
       * Makes an oriented box.
       *
       * @param hx - The half-width.
       * @param hy - The half-height.
       * @param center - The center of the box in local coordinates.
       * @param angle - The rotation of the box in radians.
       */
      SetAsBox(hx: number, hy: number, center: Vector3, angle: number): void;

      /**
       * Validates convexity. This is a very time consuming operation.
       *
       * @returns `true` if the polygon is valid.
       */
      Validate(): boolean;

      /**
       * Gets the centroid.
       *
       * @returns The centroid.
       */
      GetCentroid(): Vector3;

      /**
       * Gets the vertices.
       *
       * @returns The vertices.
       */
      GetVertices(): Vector3[];

      /**
       * Gets the edge normals.
       *
       * @returns The normals.
       */
      GetNormals(): Vector3[];

      /**
       * Gets the number of vertices.
       *
       * @returns The vertex count.
       */
      GetCount(): number;
    }

    /** A line segment shape, from {@link box2d.NewEdgeShape}. */
    interface EdgeShape extends Shape {
      /**
       * Copies the shape.
       *
       * @returns A new edge shape.
       */
      Clone(): EdgeShape;

      /**
       * Makes the edge part of a sequence. `v0` precedes the edge and `v3`
       * follows it; they smooth movement across junctions. The collision becomes
       * one-sided, with the normal pointing right when looking from `v1` to `v2`.
       *
       * @param v0 - The vertex before the edge.
       * @param v1 - The edge start.
       * @param v2 - The edge end.
       * @param v3 - The vertex after the edge.
       */
      SetOneSided(v0: Vector3, v1: Vector3, v2: Vector3, v3: Vector3): void;

      /**
       * Makes the edge isolated. The collision is two-sided.
       *
       * @param v1 - The edge start.
       * @param v2 - The edge end.
       */
      SetTwoSided(v1: Vector3, v2: Vector3): void;

      /**
       * Gets the vertex before the edge.
       *
       * @returns The vertex.
       */
      GetVertex0(): Vector3;

      /**
       * Gets the edge start.
       *
       * @returns The vertex.
       */
      GetVertex1(): Vector3;

      /**
       * Gets the edge end.
       *
       * @returns The vertex.
       */
      GetVertex2(): Vector3;

      /**
       * Gets the vertex after the edge.
       *
       * @returns The vertex.
       */
      GetVertex3(): Vector3;

      /**
       * Whether the edge collides on one side only.
       *
       * @returns `true` if the edge is one-sided.
       */
      IsOneSided(): boolean;
    }

    /** A chain of line segments, from {@link box2d.NewChainShape}. */
    interface ChainShape extends Shape {
      /**
       * Copies the shape.
       *
       * @returns A new chain shape.
       */
      Clone(): ChainShape;

      /**
       * Casts a ray against one segment of the chain.
       *
       * @param input - The ray-cast input parameters.
       * @param transform - The transform applied to the shape.
       * @param childIndex - The segment index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The hit, or `nil` if the ray misses.
       */
      RayCast(
        input: RayCastInput,
        transform: Transform,
        childIndex: number,
      ): RayCastOutput | undefined;

      /**
       * Computes the axis-aligned bounding box of one segment of the chain.
       *
       * @param xf - The world transform of the shape.
       * @param childIndex - The segment index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The box.
       */
      ComputeAABB(xf: Transform, childIndex: number): AABB;

      /** Clears all vertices. */
      Clear(): void;

      /**
       * Creates a loop, connecting the last vertex to the first.
       *
       * @param vertices - The vertices, which are copied.
       */
      CreateLoop(vertices: Vector3[]): void;

      /**
       * Creates a chain with ghost vertices that connect it to other chains.
       *
       * @param vertices - The vertices, which are copied.
       * @param prevVertex - The vertex of the previous chain that connects to the start.
       * @param nextVertex - The vertex of the next chain that connects to the end.
       */
      CreateChain(vertices: Vector3[], prevVertex: Vector3, nextVertex: Vector3): void;

      /**
       * Gets one segment of the chain as an edge.
       *
       * @param index - The segment index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The segment.
       */
      GetChildEdge(index: number): EdgeShape;

      /**
       * Gets the vertices.
       *
       * @returns The vertices.
       */
      GetVertices(): Vector3[];

      /**
       * Gets the ghost vertex after the end.
       *
       * @returns The vertex.
       */
      GetNextVertex(): Vector3;

      /**
       * Gets the ghost vertex before the start.
       *
       * @returns The vertex.
       */
      GetPrevVertex(): Vector3;

      /**
       * Gets the number of vertices.
       *
       * @returns The vertex count.
       */
      GetCount(): number;
    }

    /**
     * A fixture definition, used to create a fixture. Every field but `shape` is
     * optional, and a key the extension does not know raises an error.
     */
    interface FixtureDef {
      /** The shape. The fixture gets a copy. */
      shape: Shape | ShapeTable;
      /** Application data. Must be a table. */
      userData?: object;
      /** The friction coefficient, usually from 0 to 1. Default is 0.2. */
      friction?: number;
      /** The restitution (elasticity), usually from 0 to 1. Default is 0. */
      restitution?: number;
      /** Collisions above this speed, in meters per second, bounce. Default is 1. */
      restitutionThreshold?: number;
      /** The density, usually in kilograms per square meter. Default is 0. */
      density?: number;
      /** A sensor collects contact information but never generates a collision response. */
      isSensor?: boolean;
      /** Contact filtering data. */
      filter?: Filter;
    }

    /**
     * A body definition. Every field is optional, and a key the extension does
     * not know raises an error.
     */
    interface BodyDef {
      /** The body type. Default is `b2_staticBody`. A dynamic body with zero mass gets a mass of one. */
      type?: BodyType;
      /** The world position. Avoid creating bodies at the origin, where shapes overlap. */
      position?: Vector3;
      /** The world angle in radians. */
      angle?: number;
      /** The linear velocity of the body's origin in world coordinates. */
      linearVelocity?: Vector3;
      /** The angular velocity. */
      angularVelocity?: number;
      /** Reduces the linear velocity. Units are 1/time. */
      linearDamping?: number;
      /** Reduces the angular velocity. Units are 1/time. */
      angularDamping?: number;
      /** `false` keeps the body from sleeping, at a CPU cost. Default is `true`. */
      allowSleep?: boolean;
      /** Whether the body starts awake. Default is `true`. */
      awake?: boolean;
      /** Prevents rotation. Useful for characters. */
      fixedRotation?: boolean;
      /**
       * Prevents a fast dynamic body from tunneling through other moving
       * bodies. Use it sparingly; it costs processing time.
       */
      bullet?: boolean;
      /** Whether the body starts enabled. Default is `true`. */
      enabled?: boolean;
      /** Application data. Must be a table. */
      userData?: object;
      /** Scales the gravity applied to this body. Default is 1. */
      gravityScale?: number;
    }

    /**
     * What every joint definition holds. `type`, `bodyA` and `bodyB` are
     * required, and a key the joint type does not know raises an error.
     */
    interface JointDef {
      /** The joint type. */
      type: JointType;
      /** The first attached body. */
      bodyA: Body;
      /** The second attached body. */
      bodyB: Body;
      /** `true` lets the attached bodies collide. */
      collideConnected?: boolean;
      /** Application data. Must be a table. */
      userData?: object;
    }

    /**
     * A revolute joint definition. {@link box2d.InitializeRevoluteJointDef}
     * fills it from a world anchor.
     */
    interface RevoluteJointDef extends JointDef {
      type: typeof b2JointType.e_revoluteJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** bodyB's angle minus bodyA's angle in the reference state, in radians. */
      referenceAngle?: number;
      /** Enables the joint limit. */
      enableLimit?: boolean;
      /** The lower angle limit in radians. */
      lowerAngle?: number;
      /** The upper angle limit in radians. */
      upperAngle?: number;
      /** Enables the joint motor. */
      enableMotor?: boolean;
      /** The desired motor speed, usually in radians per second. */
      motorSpeed?: number;
      /** The maximum motor torque, usually in N-m. */
      maxMotorTorque?: number;
    }

    /**
     * A prismatic joint definition. {@link box2d.InitializePrismaticJointDef}
     * fills it from a world anchor and axis.
     */
    interface PrismaticJointDef extends JointDef {
      type: typeof b2JointType.e_prismaticJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** The translation unit axis in bodyA. */
      localAxisA?: Vector3;
      /** bodyB's angle minus bodyA's angle, in radians. */
      referenceAngle?: number;
      /** Enables the joint limit. */
      enableLimit?: boolean;
      /** The lower translation limit, usually in meters. */
      lowerTranslation?: number;
      /** The upper translation limit, usually in meters. */
      upperTranslation?: number;
      /** Enables the joint motor. */
      enableMotor?: boolean;
      /** The maximum motor force, usually in N. */
      maxMotorForce?: number;
      /** The desired motor speed, usually in meters per second. */
      motorSpeed?: number;
    }

    /**
     * A distance joint definition. {@link box2d.InitializeDistanceJointDef}
     * fills it from two world anchors.
     */
    interface DistanceJointDef extends JointDef {
      type: typeof b2JointType.e_distanceJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** The rest length. */
      length?: number;
      /** The minimum length. */
      minLength?: number;
      /** The maximum length. Must be at least the minimum length. */
      maxLength?: number;
      /** The linear stiffness in N/m. */
      stiffness?: number;
      /** The linear damping in N*s/m. */
      damping?: number;
    }

    /**
     * A pulley joint definition. {@link box2d.InitializePulleyJointDef} fills it
     * from world anchors and a ratio.
     */
    interface PulleyJointDef extends JointDef {
      type: typeof b2JointType.e_pulleyJoint;
      /** The first ground anchor in world coordinates. It never moves. */
      groundAnchorA?: Vector3;
      /** The second ground anchor in world coordinates. It never moves. */
      groundAnchorB?: Vector3;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** The reference length of the segment attached to bodyA. */
      lengthA?: number;
      /** The reference length of the segment attached to bodyB. */
      lengthB?: number;
      /** The pulley ratio, used to simulate a block-and-tackle. */
      ratio?: number;
    }

    /** A mouse joint definition. */
    interface MouseJointDef extends JointDef {
      type: typeof b2JointType.e_mouseJoint;
      /** The initial world target point, assumed to coincide with the body anchor. */
      target?: Vector3;
      /** The maximum force used to move the body, usually a multiple of its weight. */
      maxForce?: number;
      /** The linear stiffness in N/m. */
      stiffness?: number;
      /** The linear damping in N*s/m. */
      damping?: number;
    }

    /**
     * A gear joint definition. It connects two existing revolute or prismatic
     * joints, whose bodyB must both be dynamic.
     */
    interface GearJointDef extends JointDef {
      type: typeof b2JointType.e_gearJoint;
      /** The first revolute or prismatic joint. */
      joint1: Joint;
      /** The second revolute or prismatic joint. */
      joint2: Joint;
      /** The gear ratio. */
      ratio?: number;
    }

    /**
     * A wheel joint definition. {@link box2d.InitializeWheelJointDef} fills it
     * from a world anchor and axis.
     */
    interface WheelJointDef extends JointDef {
      type: typeof b2JointType.e_wheelJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** The translation axis in bodyA. */
      localAxisA?: Vector3;
      /** Enables the joint limit. */
      enableLimit?: boolean;
      /** The lower translation limit, usually in meters. */
      lowerTranslation?: number;
      /** The upper translation limit, usually in meters. */
      upperTranslation?: number;
      /** Enables the joint motor. */
      enableMotor?: boolean;
      /** The maximum motor torque, usually in N-m. */
      maxMotorTorque?: number;
      /** The desired motor speed in radians per second. */
      motorSpeed?: number;
      /** The suspension stiffness, typically in N/m. */
      stiffness?: number;
      /** The suspension damping, typically in N*s/m. */
      damping?: number;
    }

    /**
     * A weld joint definition. {@link box2d.InitializeWeldJointDef} fills it
     * from a world anchor.
     */
    interface WeldJointDef extends JointDef {
      type: typeof b2JointType.e_weldJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** bodyB's angle minus bodyA's angle in the reference state, in radians. */
      referenceAngle?: number;
      /** The rotational stiffness in N*m. 0 disables softness. */
      stiffness?: number;
      /** The rotational damping in N*m*s. */
      damping?: number;
    }

    /**
     * A friction joint definition. {@link box2d.InitializeFrictionJointDef}
     * fills it from a world anchor.
     */
    interface FrictionJointDef extends JointDef {
      type: typeof b2JointType.e_frictionJoint;
      /** The anchor relative to bodyA's origin. */
      localAnchorA?: Vector3;
      /** The anchor relative to bodyB's origin. */
      localAnchorB?: Vector3;
      /** The maximum friction force in N. */
      maxForce?: number;
      /** The maximum friction torque in N-m. */
      maxTorque?: number;
    }

    /**
     * A motor joint definition. {@link box2d.InitializeMotorJointDef} fills it
     * from the current transforms.
     */
    interface MotorJointDef extends JointDef {
      type: typeof b2JointType.e_motorJoint;
      /** bodyB's position minus bodyA's position, in bodyA's frame, in meters. */
      linearOffset?: Vector3;
      /** bodyB's angle minus bodyA's angle, in radians. */
      angularOffset?: number;
      /** The maximum motor force in N. */
      maxForce?: number;
      /** The maximum motor torque in N-m. */
      maxTorque?: number;
      /** The position correction factor, from 0 to 1. */
      correctionFactor?: number;
    }

    /**
     * Contact callbacks for {@link World.SetContactListener}. They run during
     * {@link World.Step}; an error in one stops the rest and is raised once the
     * step ends. A key the extension does not know raises an error.
     */
    interface ContactListener {
      /** Called when two fixtures begin to touch. */
      BeginContact?: (this: void, contact: Contact) => void;
      /** Called when two fixtures stop touching. */
      EndContact?: (this: void, contact: Contact) => void;
      /** Called after a contact is updated and before it goes to the solver. */
      PreSolve?: (this: void, contact: Contact, oldManifold: Manifold) => void;
      /** Called after the solver, with the impulses it applied. */
      PostSolve?: (this: void, contact: Contact, impulse: ContactImpulse) => void;
    }

    /**
     * Callbacks for {@link World.SetDestructionListener}, called when a body's
     * destruction implicitly destroys a joint or fixture. A key the extension
     * does not know raises an error.
     */
    interface DestructionListener {
      /** Called before the fixture is destroyed. */
      SayGoodbyeFixture?: (this: void, fixture: Fixture) => void;
      /** Called before the joint is destroyed. */
      SayGoodbyeJoint?: (this: void, joint: Joint) => void;
    }

    /**
     * The table {@link box2d.NewDebugDraw} reads: the flags and the drawing
     * callbacks, which run during {@link World.DebugDraw}. Points and axes are
     * plain `{x, y}` tables. A key the extension does not know raises an error.
     */
    interface DebugDrawCallbacks {
      /** What to draw: a sum of {@link b2Draw} bits. */
      flags?: number;
      /** Draws a closed polygon outline. */
      DrawPolygon?: (this: void, vertices: Vec2[], color: Color) => void;
      /** Draws a filled polygon. */
      DrawSolidPolygon?: (this: void, vertices: Vec2[], color: Color) => void;
      /** Draws a circle outline. */
      DrawCircle?: (this: void, center: Vec2, radius: number, color: Color) => void;
      /** Draws a filled circle, with `axis` marking its rotation. */
      DrawSolidCircle?: (
        this: void,
        center: Vec2,
        radius: number,
        axis: Vec2,
        color: Color,
      ) => void;
      /** Draws a line segment. */
      DrawSegment?: (this: void, p1: Vec2, p2: Vec2, color: Color) => void;
      /** Draws a transform frame. */
      DrawTransform?: (this: void, xf: Transform) => void;
      /** Accepted, but never called: the extension's `Draw::DrawPoint` has an empty body. */
      DrawPoint?: (this: void) => void;
    }

    /**
     * Holds the drawing callbacks a world calls from {@link World.DebugDraw}.
     * Created by {@link box2d.NewDebugDraw}.
     */
    interface DebugDraw {
      /**
       * Sets the drawing flags.
       *
       * @param flags - A sum of {@link b2Draw} bits.
       */
      SetFlags(flags: number): void;

      /**
       * Gets the drawing flags.
       *
       * @returns A sum of {@link b2Draw} bits.
       */
      GetFlags(): number;

      /**
       * Clears flags from the current flags.
       *
       * @param flags - A sum of {@link b2Draw} bits.
       */
      ClearFlags(flags: number): void;

      /** Frees the debug draw. */
      Destroy(): void;
    }

    /**
     * Manages contact between two shapes. A contact exists for each overlapping
     * AABB in the broad-phase, so it may have no contact points.
     */
    interface Contact {
      /**
       * Gets the next contact in the world's contact list.
       *
       * @returns The next contact, or `nil` at the end of the list.
       */
      GetNext(): Contact | undefined;

      /**
       * Gets the local manifold.
       *
       * @returns The manifold.
       */
      GetManifold(): Manifold;

      /**
       * Gets the world manifold.
       *
       * @returns The manifold in world coordinates.
       */
      GetWorldManifold(): WorldManifold;

      /**
       * Whether this contact is touching.
       *
       * @returns `true` if the fixtures touch.
       */
      IsTouching(): boolean;

      /**
       * Enables or disables this contact for the current time step (or
       * sub-step in continuous collisions). Use it inside `PreSolve`.
       *
       * @param flag - `false` disables the contact.
       */
      SetEnabled(flag: boolean): void;

      /**
       * Whether this contact is enabled.
       *
       * @returns `true` if the contact is enabled.
       */
      IsEnabled(): boolean;

      /**
       * Gets fixture A.
       *
       * @returns The fixture.
       */
      GetFixtureA(): Fixture;

      /**
       * Gets the child primitive index for fixture A.
       *
       * @returns The index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       */
      GetChildIndexA(): number;

      /**
       * Gets fixture B.
       *
       * @returns The fixture.
       */
      GetFixtureB(): Fixture;

      /**
       * Gets the child primitive index for fixture B.
       *
       * @returns The index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       */
      GetChildIndexB(): number;

      /**
       * Overrides the default friction mixture. Call it in `PreSolve`; the value
       * persists until it is set or reset.
       *
       * @param friction - The friction.
       */
      SetFriction(friction: number): void;

      /**
       * Gets the friction.
       *
       * @returns The friction.
       */
      GetFriction(): number;

      /** Resets the friction mixture to the default value. */
      ResetFriction(): void;

      /**
       * Overrides the default restitution mixture. Call it in `PreSolve`; the
       * value persists until it is set or reset.
       *
       * @param restitution - The restitution.
       */
      SetRestitution(restitution: number): void;

      /**
       * Gets the restitution.
       *
       * @returns The restitution.
       */
      GetRestitution(): number;

      /** Resets the restitution to the default value. */
      ResetRestitution(): void;

      /**
       * Overrides the default restitution velocity threshold mixture. Call it in
       * `PreSolve`; the value persists until it is set or reset.
       *
       * @param threshold - The threshold.
       */
      SetRestitutionThreshold(threshold: number): void;

      /**
       * Gets the restitution threshold.
       *
       * @returns The threshold.
       */
      GetRestitutionThreshold(): number;

      /** Resets the restitution threshold to the default value. */
      ResetRestitutionThreshold(): void;

      /**
       * Sets the desired tangent speed for a conveyor belt, in meters per second.
       *
       * @param speed - The speed.
       */
      SetTangentSpeed(speed: number): void;

      /**
       * Gets the desired tangent speed, in meters per second.
       *
       * @returns The speed.
       */
      GetTangentSpeed(): number;
    }

    /** Attaches a shape to a body for collision detection. Created by {@link Body.CreateFixture}. */
    interface Fixture {
      /**
       * Gets the type of the fixture's shape.
       *
       * @returns A {@link b2Shape} value.
       */
      GetType(): ShapeType;

      /**
       * Gets a copy of the shape. Changing the copy does not change the fixture.
       *
       * @returns The shape copy.
       */
      GetShape(): Shape;

      /**
       * Sets whether this fixture is a sensor.
       *
       * @param sensor - `true` makes it a sensor.
       */
      SetSensor(sensor: boolean): void;

      /**
       * Whether this fixture is a sensor (non-solid).
       *
       * @returns `true` if it is a sensor.
       */
      IsSensor(): boolean;

      /**
       * Sets the contact filtering data. Contacts update at the next step when
       * either body is active and awake. This calls {@link Fixture.Refilter}.
       *
       * @param filter - The filtering data.
       */
      SetFilterData(filter: Filter): void;

      /**
       * Gets the contact filtering data.
       *
       * @returns The filtering data.
       */
      GetFilterData(): Filter;

      /** Re-establishes collision that a contact filter previously disabled. */
      Refilter(): void;

      /**
       * Gets the body this fixture is attached to.
       *
       * @returns The body.
       */
      GetBody(): Body;

      /**
       * Gets the next fixture in the body's fixture list.
       *
       * @returns The next fixture, or `nil` at the end of the list.
       */
      GetNext(): Fixture | undefined;

      /**
       * Gets the application data.
       *
       * @returns The table, or `nil` if none is set.
       */
      GetUserData(): object | undefined;

      /**
       * Sets the application data.
       *
       * @param userdata - A table, or `nil` to clear it.
       */
      SetUserData(userdata: object | undefined): void;

      /**
       * Tests a point for containment in this fixture.
       *
       * @param point - A point in world coordinates.
       * @returns `true` if the point is inside.
       */
      TestPoint(point: Vector3): boolean;

      /**
       * Casts a ray against this fixture's shape.
       *
       * @param input - The ray-cast input parameters.
       * @param childIndex - The child shape index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The hit, or `nil` if the ray misses.
       */
      RayCast(input: RayCastInput, childIndex: number): RayCastOutput | undefined;

      /**
       * Gets the mass data, from the density and the shape. The inertia is about
       * the shape's origin. This may be expensive.
       *
       * @returns The mass data.
       */
      GetMassData(): MassData;

      /**
       * Gets the density.
       *
       * @returns The density.
       */
      GetDensity(): number;

      /**
       * Sets the density. This does not update the body's mass; call
       * {@link Body.ResetMassData} for that.
       *
       * @param density - The density.
       */
      SetDensity(density: number): void;

      /**
       * Gets the friction coefficient.
       *
       * @returns The friction.
       */
      GetFriction(): number;

      /**
       * Sets the friction coefficient. Existing contacts keep their friction.
       *
       * @param friction - The friction.
       */
      SetFriction(friction: number): void;

      /**
       * Gets the restitution coefficient.
       *
       * @returns The restitution.
       */
      GetRestitution(): number;

      /**
       * Sets the restitution coefficient. Existing contacts keep their restitution.
       *
       * @param restitution - The restitution.
       */
      SetRestitution(restitution: number): void;

      /**
       * Gets the restitution velocity threshold.
       *
       * @returns The threshold.
       */
      GetRestitutionThreshold(): number;

      /**
       * Sets the restitution velocity threshold. Existing contacts keep theirs.
       *
       * @param threshold - The threshold.
       */
      SetRestitutionThreshold(threshold: number): void;

      /**
       * Gets the fixture's AABB, which may be enlarged or stale. For an exact
       * box, compute it from the shape and the body transform.
       *
       * @param childIndex - The child shape index. **0️⃣ 0-based; passed to `box2d` unchanged.**
       * @returns The box.
       */
      GetAABB(childIndex: number): AABB;

      /**
       * Dumps this fixture to the log.
       *
       * @param bodyIndex - The index the dump gives the fixture's body. **0️⃣ 0-based; passed to `box2d` unchanged.**
       */
      Dump(bodyIndex: number): void;
    }

    /** A rigid body. Created by {@link World.CreateBody}. */
    interface Body {
      /**
       * Creates a fixture from a definition and attaches it to this body. If
       * the density is non-zero, the body's mass is updated. Contacts are not
       * created until the next step. Not allowed during callbacks.
       *
       * @param def - The fixture definition.
       * @returns The fixture.
       */
      CreateFixture(def: FixtureDef): Fixture;

      /**
       * Creates a fixture from a shape and attaches it to this body. Use a
       * {@link FixtureDef} to set friction, restitution, user data or
       * filtering. Not allowed during callbacks.
       *
       * @param shape - The shape. The fixture gets a copy.
       * @param density - The shape density; zero for a static body.
       * @returns The fixture.
       */
      CreateFixture(shape: Shape | ShapeTable, density: number): Fixture;

      /**
       * Destroys a fixture, removing it from the broad-phase and destroying its
       * contacts. A dynamic body's mass is adjusted if the fixture had positive
       * density. Not allowed during callbacks.
       *
       * @param fixture - The fixture.
       */
      DestroyFixture(fixture: Fixture): void;

      /**
       * Sets the position of the body's origin and its rotation. This may cause
       * non-physical behavior; contacts update at the next step.
       *
       * @param position - The world position of the body's local origin.
       * @param angle - The world rotation in radians. Default is the current angle.
       */
      SetTransform(position: Vector3, angle?: number): void;

      /**
       * Gets the transform of the body's origin.
       *
       * @returns The transform.
       */
      GetTransform(): Transform;

      /**
       * Gets the world position of the body's origin.
       *
       * @returns The position.
       */
      GetPosition(): Vector3;

      /**
       * Gets the world position of the body's origin as two numbers, with no
       * `vector3` allocated.
       *
       * @returns `x` and `y`.
       */
      GetPositionRaw(): LuaMultiReturn<[number, number]>;

      /**
       * Gets the angle.
       *
       * @returns The angle in radians.
       */
      GetAngle(): number;

      /**
       * Gets the world position of the center of mass.
       *
       * @returns The position.
       */
      GetWorldCenter(): Vector3;

      /**
       * Gets the local position of the center of mass.
       *
       * @returns The position.
       */
      GetLocalCenter(): Vector3;

      /**
       * Sets the linear velocity of the center of mass.
       *
       * @param velocity - The velocity.
       */
      SetLinearVelocity(velocity: Vector3): void;

      /**
       * Gets the linear velocity of the center of mass.
       *
       * @returns The velocity.
       */
      GetLinearVelocity(): Vector3;

      /**
       * Sets the angular velocity.
       *
       * @param omega - The angular velocity in radians per second.
       */
      SetAngularVelocity(omega: number): void;

      /**
       * Gets the angular velocity.
       *
       * @returns The angular velocity in radians per second.
       */
      GetAngularVelocity(): number;

      /**
       * Applies a force at a world point. Off the center of mass it also
       * produces a torque.
       *
       * @param force - The world force, usually in N.
       * @param point - The world position where it applies.
       * @param wake - `true` also wakes the body.
       */
      ApplyForce(force: Vector3, point: Vector3, wake: boolean): void;

      /**
       * Applies a force to the center of mass.
       *
       * @param force - The world force, usually in N.
       * @param wake - `true` also wakes the body.
       */
      ApplyForceToCenter(force: Vector3, wake: boolean): void;

      /**
       * Applies a torque. This changes the angular velocity but not the linear
       * velocity of the center of mass.
       *
       * @param torque - The torque about the z-axis, usually in N-m.
       * @param wake - `true` also wakes the body.
       */
      ApplyTorque(torque: number, wake: boolean): void;

      /**
       * Applies an impulse at a world point. This changes the velocity at once,
       * and the angular velocity if the point is off the center of mass.
       *
       * @param impulse - The world impulse, usually in N-s.
       * @param point - The world position where it applies.
       * @param wake - `true` also wakes the body.
       */
      ApplyLinearImpulse(impulse: Vector3, point: Vector3, wake: boolean): void;

      /**
       * Applies an impulse to the center of mass. This changes the velocity at once.
       *
       * @param impulse - The world impulse, usually in N-s.
       * @param wake - `true` also wakes the body.
       */
      ApplyLinearImpulseToCenter(impulse: Vector3, wake: boolean): void;

      /**
       * Applies an angular impulse.
       *
       * @param impulse - The angular impulse in kg*m*m/s.
       * @param wake - `true` also wakes the body.
       */
      ApplyAngularImpulse(impulse: number, wake: boolean): void;

      /**
       * Gets the total mass.
       *
       * @returns The mass, usually in kilograms.
       */
      GetMass(): number;

      /**
       * Gets the rotational inertia about the local origin.
       *
       * @returns The inertia, usually in kg-m^2.
       */
      GetInertia(): number;

      /**
       * Resets the mass properties to the sum of the fixtures' mass properties.
       * Needed only after {@link Body.SetMassData} overrode them.
       */
      ResetMassData(): void;

      /**
       * Gets the mass data.
       *
       * @returns The mass, inertia and center of the body.
       */
      GetMassData(): MassData;

      /**
       * Overrides the mass properties of the fixtures. This moves the center of
       * mass, and has no effect on a body that is not dynamic.
       *
       * @param data - The mass properties.
       */
      SetMassData(data: MassData): void;

      /**
       * Converts a local point to world coordinates.
       *
       * @param localPoint - A point relative to the body's origin.
       * @returns The point in world coordinates.
       */
      GetWorldPoint(localPoint: Vector3): Vector3;

      /**
       * Converts a local vector to world coordinates.
       *
       * @param localVector - A vector fixed in the body.
       * @returns The vector in world coordinates.
       */
      GetWorldVector(localVector: Vector3): Vector3;

      /**
       * Converts a world point to a point relative to the body's origin.
       *
       * @param worldPoint - A point in world coordinates.
       * @returns The local point.
       */
      GetLocalPoint(worldPoint: Vector3): Vector3;

      /**
       * Converts a world vector to a local vector.
       *
       * @param worldVector - A vector in world coordinates.
       * @returns The local vector.
       */
      GetLocalVector(worldVector: Vector3): Vector3;

      /**
       * Gets the world velocity of a local point.
       *
       * @param localPoint - A point in local coordinates.
       * @returns The world velocity of the point.
       */
      GetLinearVelocityFromLocalPoint(localPoint: Vector3): Vector3;

      /**
       * Gets the world velocity of a world point attached to this body.
       *
       * @param worldPoint - A point in world coordinates.
       * @returns The world velocity of the point.
       */
      GetLinearVelocityFromWorldPoint(worldPoint: Vector3): Vector3;

      /**
       * Sets the linear damping.
       *
       * @param linearDamping - The damping.
       */
      SetLinearDamping(linearDamping: number): void;

      /**
       * Gets the linear damping.
       *
       * @returns The damping.
       */
      GetLinearDamping(): number;

      /**
       * Sets the angular damping.
       *
       * @param angularDamping - The damping.
       */
      SetAngularDamping(angularDamping: number): void;

      /**
       * Gets the angular damping.
       *
       * @returns The damping.
       */
      GetAngularDamping(): number;

      /**
       * Sets the gravity scale.
       *
       * @param scale - The scale.
       */
      SetGravityScale(scale: number): void;

      /**
       * Gets the gravity scale.
       *
       * @returns The scale.
       */
      GetGravityScale(): number;

      /**
       * Sets the body type. This may change the mass and velocity.
       *
       * @param type - A {@link b2BodyType} value.
       */
      SetType(type: BodyType): void;

      /**
       * Gets the body type.
       *
       * @returns A {@link b2BodyType} value.
       */
      GetType(): BodyType;

      /**
       * Sets whether the body is treated like a bullet for continuous collision detection.
       *
       * @param flag - `true` makes it a bullet.
       */
      SetBullet(flag: boolean): void;

      /**
       * Whether the body is treated like a bullet for continuous collision detection.
       *
       * @returns `true` if it is a bullet.
       */
      IsBullet(): boolean;

      /**
       * Sets whether the body may sleep. Disallowing sleep wakes the body.
       *
       * @param flag - `false` keeps the body awake.
       */
      SetSleepingAllowed(flag: boolean): void;

      /**
       * Whether the body may sleep.
       *
       * @returns `true` if sleep is allowed.
       */
      IsSleepingAllowed(): boolean;

      /**
       * Wakes the body or puts it to sleep. A sleeping body costs very little CPU.
       *
       * @param flag - `true` wakes the body, `false` puts it to sleep.
       */
      SetAwake(flag: boolean): void;

      /**
       * Whether the body is awake.
       *
       * @returns `true` if the body is awake.
       */
      IsAwake(): boolean;

      /**
       * Enables or disables the body. A disabled body is not simulated, cannot
       * be collided with or woken, and stays in the world. Its fixtures leave
       * the broad-phase and its contacts are destroyed; its joints are
       * implicitly disabled.
       *
       * @param flag - `true` enables the body.
       */
      SetEnabled(flag: boolean): void;

      /**
       * Whether the body is enabled.
       *
       * @returns `true` if the body is enabled.
       */
      IsEnabled(): boolean;

      /**
       * Sets whether the body has fixed rotation. This resets the mass.
       *
       * @param flag - `true` fixes the rotation.
       */
      SetFixedRotation(flag: boolean): void;

      /**
       * Whether the body has fixed rotation.
       *
       * @returns `true` if the rotation is fixed.
       */
      IsFixedRotation(): boolean;

      /**
       * Gets the next body in the world's body list.
       *
       * @returns The next body, or `nil` at the end of the list.
       */
      GetNext(): Body | undefined;

      /**
       * Gets the first fixture attached to this body. Use {@link Fixture.GetNext}
       * for the rest.
       *
       * @returns The first fixture, or `nil` if the body has none.
       */
      GetFixtureList(): Fixture | undefined;

      /**
       * Gets the contacts attached to this body. The list changes during the
       * time step, so use a {@link ContactListener} not to miss collisions.
       *
       * **⚠️ The list is the body's own table, filled from index 1; a contact
       * from an earlier, longer call stays past the end of the current list.**
       *
       * @returns The contacts.
       */
      GetContactList(): Contact[];

      /**
       * Gets the joints attached to this body.
       *
       * **⚠️ The list is the body's own table, filled from index 1; a joint from
       * an earlier, longer call stays past the end of the current list.**
       *
       * @returns The joints.
       */
      GetJointList(): Joint[];

      /**
       * Gets the application data.
       *
       * @returns The table, or `nil` if none is set.
       */
      GetUserData(): object | undefined;

      /**
       * Sets the application data.
       *
       * @param data - A table, or `nil` to clear it.
       */
      SetUserData(data: object | undefined): void;

      /**
       * Gets the world this body belongs to.
       *
       * @returns The world.
       */
      GetWorld(): World;

      /** Dumps this body to the log. */
      Dump(): void;
    }

    /**
     * The base joint. Joints constrain two bodies together; some also have
     * limits and motors. Created by {@link World.CreateJoint}.
     *
     * Every joint shares one set of methods, so a method of another joint type
     * raises `function not supported`.
     */
    interface Joint {
      /**
       * Gets the joint type.
       *
       * @returns A {@link b2JointType} value.
       */
      GetType(): JointType;

      /**
       * Gets the first attached body.
       *
       * @returns bodyA.
       */
      GetBodyA(): Body;

      /**
       * Gets the second attached body.
       *
       * @returns bodyB.
       */
      GetBodyB(): Body;

      /**
       * Gets the anchor on bodyA in world coordinates.
       *
       * @returns The anchor.
       */
      GetAnchorA(): Vector3;

      /**
       * Gets the anchor on bodyB in world coordinates.
       *
       * @returns The anchor.
       */
      GetAnchorB(): Vector3;

      /**
       * Gets the reaction force on bodyB at the joint anchor.
       *
       * @param inv_dt - The inverse time step.
       * @returns The force in N.
       */
      GetReactionForce(inv_dt: number): Vector3;

      /**
       * Gets the reaction torque on bodyB.
       *
       * @param inv_dt - The inverse time step.
       * @returns The torque in N*m.
       */
      GetReactionTorque(inv_dt: number): number;

      /**
       * Gets the next joint in the world's joint list.
       *
       * @returns The next joint, or `nil` at the end of the list.
       */
      GetNext(): Joint | undefined;

      /**
       * Gets the application data.
       *
       * @returns The table, or `nil` if none is set.
       */
      GetUserData(): object | undefined;

      /**
       * Sets the application data.
       *
       * @param userdata - A table, or `nil` to clear it.
       */
      SetUserData(userdata: object | undefined): void;

      /**
       * Whether either attached body is enabled.
       *
       * @returns `true` if one is.
       */
      IsEnabled(): boolean;

      /**
       * Whether the attached bodies collide. Changing it has no effect on
       * fixtures that already overlap.
       *
       * @returns `true` if they collide.
       */
      GetCollideConnected(): boolean;

      /** Dumps this joint to the log. */
      Dump(): void;

      /**
       * Shifts the origin of any points stored in world coordinates.
       *
       * @param newOrigin - The new origin relative to the old one.
       */
      ShiftOrigin(newOrigin: Vector3): void;
    }

    /**
     * Constrains two bodies to share a point while they rotate freely about it.
     * The rotation can be limited and driven by a motor.
     */
    interface RevoluteJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Gets the reference angle.
       *
       * @returns The angle in radians.
       */
      GetReferenceAngle(): number;

      /**
       * Gets the current joint angle.
       *
       * @returns The angle in radians.
       */
      GetJointAngle(): number;

      /**
       * Gets the current joint angular speed.
       *
       * @returns The speed in radians per second.
       */
      GetJointSpeed(): number;

      /**
       * Whether the joint limit is enabled.
       *
       * @returns `true` if it is.
       */
      IsLimitEnabled(): boolean;

      /**
       * Enables or disables the joint limit.
       *
       * @param flag - `true` enables it.
       */
      EnableLimit(flag: boolean): void;

      /**
       * Gets the lower joint limit.
       *
       * @returns The limit in radians.
       */
      GetLowerLimit(): number;

      /**
       * Gets the upper joint limit.
       *
       * @returns The limit in radians.
       */
      GetUpperLimit(): number;

      /**
       * Sets the joint limits.
       *
       * @param lower - The lower limit in radians.
       * @param upper - The upper limit in radians.
       */
      SetLimits(lower: number, upper: number): void;

      /**
       * Whether the joint motor is enabled.
       *
       * @returns `true` if it is.
       */
      IsMotorEnabled(): boolean;

      /**
       * Enables or disables the joint motor.
       *
       * @param flag - `true` enables it.
       */
      EnableMotor(flag: boolean): void;

      /**
       * Sets the motor speed.
       *
       * @param speed - The speed in radians per second.
       */
      SetMotorSpeed(speed: number): void;

      /**
       * Gets the motor speed.
       *
       * @returns The speed in radians per second.
       */
      GetMotorSpeed(): number;

      /**
       * Sets the maximum motor torque.
       *
       * @param torque - The torque, usually in N-m.
       */
      SetMaxMotorTorque(torque: number): void;

      /**
       * Gets the maximum motor torque.
       *
       * @returns The torque, usually in N-m.
       */
      GetMaxMotorTorque(): number;

      /**
       * Gets the current motor torque.
       *
       * @param inv_dt - The inverse time step.
       * @returns The torque in N*m.
       */
      GetMotorTorque(inv_dt: number): number;
    }

    /**
     * Allows translation along an axis fixed in bodyA and prevents relative
     * rotation. The translation can be limited and driven by a motor.
     */
    interface PrismaticJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Gets the joint axis relative to bodyA.
       *
       * @returns The axis.
       */
      GetLocalAxisA(): Vector3;

      /**
       * Gets the reference angle.
       *
       * @returns The angle in radians.
       */
      GetReferenceAngle(): number;

      /**
       * Gets the current joint translation.
       *
       * @returns The translation, usually in meters.
       */
      GetJointTranslation(): number;

      /**
       * Gets the current joint translation speed.
       *
       * @returns The speed, usually in meters per second.
       */
      GetJointSpeed(): number;

      /**
       * Whether the joint limit is enabled.
       *
       * @returns `true` if it is.
       */
      IsLimitEnabled(): boolean;

      /**
       * Enables or disables the joint limit.
       *
       * @param flag - `true` enables it.
       */
      EnableLimit(flag: boolean): void;

      /**
       * Gets the lower joint limit.
       *
       * @returns The limit, usually in meters.
       */
      GetLowerLimit(): number;

      /**
       * Gets the upper joint limit.
       *
       * @returns The limit, usually in meters.
       */
      GetUpperLimit(): number;

      /**
       * Sets the joint limits.
       *
       * @param lower - The lower limit, usually in meters.
       * @param upper - The upper limit, usually in meters.
       */
      SetLimits(lower: number, upper: number): void;

      /**
       * Whether the joint motor is enabled.
       *
       * @returns `true` if it is.
       */
      IsMotorEnabled(): boolean;

      /**
       * Enables or disables the joint motor.
       *
       * @param flag - `true` enables it.
       */
      EnableMotor(flag: boolean): void;

      /**
       * Sets the motor speed.
       *
       * @param speed - The speed, usually in meters per second.
       */
      SetMotorSpeed(speed: number): void;

      /**
       * Gets the motor speed.
       *
       * @returns The speed, usually in meters per second.
       */
      GetMotorSpeed(): number;

      /**
       * Sets the maximum motor force.
       *
       * @param force - The force, usually in N.
       */
      SetMaxMotorForce(force: number): void;

      /**
       * Gets the maximum motor force.
       *
       * @returns The force, usually in N.
       */
      GetMaxMotorForce(): number;

      /**
       * Gets the current motor force.
       *
       * @param inv_dt - The inverse time step.
       * @returns The force, usually in N.
       */
      GetMotorForce(inv_dt: number): number;
    }

    /** Keeps two points on two bodies at a distance, like a massless rod or spring. */
    interface DistanceJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Gets the rest length.
       *
       * @returns The length.
       */
      GetLength(): number;

      /**
       * Sets the rest length, which Box2D clamps to a stable minimum.
       *
       * @param length - The length.
       */
      SetLength(length: number): void;

      /**
       * Gets the minimum length.
       *
       * @returns The length.
       */
      GetMinLength(): number;

      /**
       * Sets the minimum length, which Box2D clamps to a stable minimum.
       *
       * @param minLength - The length.
       */
      SetMinLength(minLength: number): void;

      /**
       * Gets the maximum length.
       *
       * @returns The length.
       */
      GetMaxLength(): number;

      /**
       * Sets the maximum length.
       *
       * @param maxLength - The length.
       */
      SetMaxLength(maxLength: number): void;

      /**
       * Gets the current length.
       *
       * @returns The length.
       */
      GetCurrentLength(): number;

      /**
       * Sets the linear stiffness.
       *
       * @param stiffness - The stiffness in N/m.
       */
      SetStiffness(stiffness: number): void;

      /**
       * Gets the linear stiffness.
       *
       * @returns The stiffness in N/m.
       */
      GetStiffness(): number;

      /**
       * Sets the linear damping.
       *
       * @param damping - The damping in N*s/m.
       */
      SetDamping(damping: number): void;

      /**
       * Gets the linear damping.
       *
       * @returns The damping in N*s/m.
       */
      GetDamping(): number;
    }

    /**
     * Connects two bodies to two fixed ground points, so that
     * `lengthA + ratio * lengthB` stays constant.
     */
    interface PulleyJoint extends Joint {
      /**
       * Gets the first ground anchor.
       *
       * @returns The anchor.
       */
      GetGroundAnchorA(): Vector3;

      /**
       * Gets the second ground anchor.
       *
       * @returns The anchor.
       */
      GetGroundAnchorB(): Vector3;

      /**
       * Gets the reference length of the segment attached to bodyA.
       *
       * @returns The length.
       */
      GetLengthA(): number;

      /**
       * Gets the reference length of the segment attached to bodyB.
       *
       * @returns The length.
       */
      GetLengthB(): number;

      /**
       * Gets the pulley ratio.
       *
       * @returns The ratio.
       */
      GetRatio(): number;

      /**
       * Gets the current length of the segment attached to bodyA.
       *
       * @returns The length.
       */
      GetCurrentLengthA(): number;

      /**
       * Gets the current length of the segment attached to bodyB.
       *
       * @returns The length.
       */
      GetCurrentLengthB(): number;
    }

    /**
     * Makes a point on a body track a world target, as a soft constraint with a
     * maximum force.
     */
    interface MouseJoint extends Joint {
      /**
       * Sets the target point.
       *
       * @param target - The world target.
       */
      SetTarget(target: Vector3): void;

      /**
       * Gets the target point.
       *
       * @returns The world target.
       */
      GetTarget(): Vector3;

      /**
       * Sets the maximum force.
       *
       * @param force - The force in N.
       */
      SetMaxForce(force: number): void;

      /**
       * Gets the maximum force.
       *
       * @returns The force in N.
       */
      GetMaxForce(): number;

      /**
       * Sets the linear stiffness.
       *
       * @param stiffness - The stiffness in N/m.
       */
      SetStiffness(stiffness: number): void;

      /**
       * Gets the linear stiffness.
       *
       * @returns The stiffness in N/m.
       */
      GetStiffness(): number;

      /**
       * Sets the linear damping.
       *
       * @param damping - The damping in N*s/m.
       */
      SetDamping(damping: number): void;

      /**
       * Gets the linear damping.
       *
       * @returns The damping in N*s/m.
       */
      GetDamping(): number;
    }

    /**
     * Connects two revolute or prismatic joints so that
     * `coordinate1 + ratio * coordinate2` stays constant. Destroy it by hand
     * when either connected joint is destroyed.
     */
    interface GearJoint extends Joint {
      /**
       * Gets the first connected joint.
       *
       * @returns The joint.
       */
      GetJoint1(): Joint;

      /**
       * Gets the second connected joint.
       *
       * @returns The joint.
       */
      GetJoint2(): Joint;

      /**
       * Sets the gear ratio.
       *
       * @param ratio - The ratio.
       */
      SetRatio(ratio: number): void;

      /**
       * Gets the gear ratio.
       *
       * @returns The ratio.
       */
      GetRatio(): number;
    }

    /**
     * Allows translation along an axis fixed in bodyA and rotation in the
     * plane, with a rotational motor and a linear spring. Designed for vehicle
     * suspensions.
     */
    interface WheelJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Gets the joint axis relative to bodyA.
       *
       * @returns The axis.
       */
      GetLocalAxisA(): Vector3;

      /**
       * Gets the current joint translation.
       *
       * @returns The translation, usually in meters.
       */
      GetJointTranslation(): number;

      /**
       * Gets the current joint linear speed.
       *
       * @returns The speed, usually in meters per second.
       */
      GetJointLinearSpeed(): number;

      /**
       * Gets the current joint angle.
       *
       * @returns The angle in radians.
       */
      GetJointAngle(): number;

      /**
       * Gets the current joint angular speed.
       *
       * @returns The speed in radians per second.
       */
      GetJointAngularSpeed(): number;

      /**
       * Whether the joint limit is enabled.
       *
       * @returns `true` if it is.
       */
      IsLimitEnabled(): boolean;

      /**
       * Enables or disables the joint translation limit.
       *
       * @param flag - `true` enables it.
       */
      EnableLimit(flag: boolean): void;

      /**
       * Gets the lower joint translation limit.
       *
       * @returns The limit, usually in meters.
       */
      GetLowerLimit(): number;

      /**
       * Gets the upper joint translation limit.
       *
       * @returns The limit, usually in meters.
       */
      GetUpperLimit(): number;

      /**
       * Sets the joint translation limits.
       *
       * @param lower - The lower limit, usually in meters.
       * @param upper - The upper limit, usually in meters.
       */
      SetLimits(lower: number, upper: number): void;

      /**
       * Whether the joint motor is enabled.
       *
       * @returns `true` if it is.
       */
      IsMotorEnabled(): boolean;

      /**
       * Enables or disables the joint motor.
       *
       * @param flag - `true` enables it.
       */
      EnableMotor(flag: boolean): void;

      /**
       * Sets the motor speed.
       *
       * @param speed - The speed, usually in radians per second.
       */
      SetMotorSpeed(speed: number): void;

      /**
       * Gets the motor speed.
       *
       * @returns The speed, usually in radians per second.
       */
      GetMotorSpeed(): number;

      /**
       * Sets the maximum motor torque.
       *
       * @param torque - The torque, usually in N-m.
       */
      SetMaxMotorTorque(torque: number): void;

      /**
       * Gets the maximum motor torque.
       *
       * @returns The torque, usually in N-m.
       */
      GetMaxMotorTorque(): number;

      /**
       * Gets the current motor torque.
       *
       * @param inv_dt - The inverse time step.
       * @returns The torque, usually in N-m.
       */
      GetMotorTorque(inv_dt: number): number;

      /**
       * Sets the spring stiffness.
       *
       * @param stiffness - The stiffness, typically in N/m.
       */
      SetStiffness(stiffness: number): void;

      /**
       * Gets the spring stiffness.
       *
       * @returns The stiffness, typically in N/m.
       */
      GetStiffness(): number;

      /**
       * Sets the spring damping.
       *
       * @param damping - The damping, typically in N*s/m.
       */
      SetDamping(damping: number): void;

      /**
       * Gets the spring damping.
       *
       * @returns The damping, typically in N*s/m.
       */
      GetDamping(): number;
    }

    /**
     * Glues two bodies together. It may distort somewhat, because the island
     * constraint solver is approximate.
     */
    interface WeldJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Gets the reference angle.
       *
       * @returns The angle in radians.
       */
      GetReferenceAngle(): number;

      /**
       * Sets the stiffness.
       *
       * @param stiffness - The stiffness in N*m.
       */
      SetStiffness(stiffness: number): void;

      /**
       * Gets the stiffness.
       *
       * @returns The stiffness in N*m.
       */
      GetStiffness(): number;

      /**
       * Sets the damping.
       *
       * @param damping - The damping in N*m*s.
       */
      SetDamping(damping: number): void;

      /**
       * Gets the damping.
       *
       * @returns The damping in N*m*s.
       */
      GetDamping(): number;
    }

    /** Applies top-down friction: 2D translational friction and angular friction. */
    interface FrictionJoint extends Joint {
      /**
       * Gets the anchor relative to bodyA's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorA(): Vector3;

      /**
       * Gets the anchor relative to bodyB's origin.
       *
       * @returns The anchor.
       */
      GetLocalAnchorB(): Vector3;

      /**
       * Sets the maximum friction force.
       *
       * @param force - The force in N.
       */
      SetMaxForce(force: number): void;

      /**
       * Gets the maximum friction force.
       *
       * @returns The force in N.
       */
      GetMaxForce(): number;

      /**
       * Sets the maximum friction torque.
       *
       * @param torque - The torque in N*m.
       */
      SetMaxTorque(torque: number): void;

      /**
       * Gets the maximum friction torque.
       *
       * @returns The torque in N*m.
       */
      GetMaxTorque(): number;
    }

    /**
     * Controls the relative motion of two bodies, typically a dynamic body
     * moving relative to the ground.
     */
    interface MotorJoint extends Joint {
      /**
       * Sets the target linear offset, in bodyA's frame.
       *
       * @param linearOffset - The offset in meters.
       */
      SetLinearOffset(linearOffset: Vector3): void;

      /**
       * Gets the target linear offset, in bodyA's frame.
       *
       * @returns The offset in meters.
       */
      GetLinearOffset(): Vector3;

      /**
       * Sets the target angular offset.
       *
       * @param angularOffset - The offset in radians.
       */
      SetAngularOffset(angularOffset: number): void;

      /**
       * Gets the target angular offset.
       *
       * @returns The offset in radians.
       */
      GetAngularOffset(): number;

      /**
       * Sets the maximum friction force.
       *
       * @param force - The force in N.
       */
      SetMaxForce(force: number): void;

      /**
       * Gets the maximum friction force.
       *
       * @returns The force in N.
       */
      GetMaxForce(): number;

      /**
       * Sets the maximum friction torque.
       *
       * @param torque - The torque in N*m.
       */
      SetMaxTorque(torque: number): void;

      /**
       * Gets the maximum friction torque.
       *
       * @returns The torque in N*m.
       */
      GetMaxTorque(): number;

      /**
       * Sets the position correction factor.
       *
       * @param factor - The factor, from 0 to 1.
       */
      SetCorrectionFactor(factor: number): void;

      /**
       * Gets the position correction factor.
       *
       * @returns The factor, from 0 to 1.
       */
      GetCorrectionFactor(): number;
    }

    /**
     * Manages all physics entities, the dynamic simulation and queries.
     * Created by {@link box2d.NewWorld}; call {@link World.Destroy} when it is
     * no longer needed.
     */
    interface World {
      /**
       * Registers a destruction listener, replacing any earlier one.
       *
       * @param listener - The callbacks, or `nil` to remove the listener.
       */
      SetDestructionListener(listener: DestructionListener | undefined): void;

      /**
       * Registers a contact listener, replacing any earlier one. Its callbacks
       * run in the script instance that registered it.
       *
       * @param listener - The callbacks, or `nil` to remove the listener.
       */
      SetContactListener(listener: ContactListener | undefined): void;

      /**
       * Registers the debug draw that {@link World.DebugDraw} calls. The debug
       * draw stays owned by the caller.
       *
       * @param draw - The debug draw, or `nil` to remove it.
       */
      SetDebugDraw(draw: DebugDraw | undefined): void;

      /**
       * Creates a rigid body. Not allowed during callbacks.
       *
       * @param bodyDef - The body definition. Default is a static body at the origin.
       * @returns The body.
       */
      CreateBody(bodyDef?: BodyDef): Body;

      /**
       * Destroys a body, with its fixtures and joints. Not allowed during callbacks.
       *
       * @param body - The body.
       */
      DestroyBody(body: Body): void;

      /**
       * Creates a revolute joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: RevoluteJointDef): RevoluteJoint;

      /**
       * Creates a prismatic joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: PrismaticJointDef): PrismaticJoint;

      /**
       * Creates a distance joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: DistanceJointDef): DistanceJoint;

      /**
       * Creates a pulley joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: PulleyJointDef): PulleyJoint;

      /**
       * Creates a mouse joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: MouseJointDef): MouseJoint;

      /**
       * Creates a gear joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: GearJointDef): GearJoint;

      /**
       * Creates a wheel joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: WheelJointDef): WheelJoint;

      /**
       * Creates a weld joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: WeldJointDef): WeldJoint;

      /**
       * Creates a friction joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: FrictionJointDef): FrictionJoint;

      /**
       * Creates a motor joint. Not allowed during callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: MotorJointDef): MotorJoint;

      /**
       * Creates a joint whose type is not known statically. Not allowed during
       * callbacks.
       *
       * @param def - The joint definition.
       * @returns The joint.
       */
      CreateJoint(def: JointDef): Joint;

      /**
       * Destroys a joint. The bodies it connected may begin to collide. Not
       * allowed during callbacks.
       *
       * @param joint - The joint.
       */
      DestroyJoint(joint: Joint): void;

      /**
       * Takes a time step: collision detection, integration and constraint
       * solution. Contact listener callbacks run inside it.
       *
       * @param timeStep - The time to simulate. It should not vary.
       * @param velocityIterations - Iterations of the velocity constraint solver.
       * @param positionIterations - Iterations of the position constraint solver.
       */
      Step(timeStep: number, velocityIterations: number, positionIterations: number): void;

      /**
       * Clears the force buffer on all bodies. Forces clear after each step
       * unless {@link World.SetAutoClearForces} turned that off, for sub-stepping.
       */
      ClearForces(): void;

      /** Calls the registered debug draw for the shapes and other debug data. */
      DebugDraw(): void;

      /**
       * Casts a ray against every fixture in its path. The ray ignores shapes
       * that contain its start.
       *
       * @param callback - Called for each fixture hit. Return -1 to ignore the
       * fixture, 0 to stop, `fraction` to clip the ray to this hit, or 1 to
       * continue without clipping.
       * @param point1 - The ray start.
       * @param point2 - The ray end.
       */
      RayCast(
        callback: (
          this: void,
          fixture: Fixture,
          point: Vector3,
          normal: Vector3,
          fraction: number,
        ) => number,
        point1: Vector3,
        point2: Vector3,
      ): void;

      /**
       * Finds every fixture whose AABB overlaps a box.
       *
       * @param callback - Called for each fixture. Return `true` to continue the
       * query, `false` to stop it.
       * @param aabb - The query box.
       */
      QueryAABB(callback: (this: void, fixture: Fixture) => boolean, aabb: AABB): void;

      /**
       * Gets the first body in the world. Use {@link Body.GetNext} for the rest.
       *
       * @returns The first body, or `nil` if there is none.
       */
      GetBodyList(): Body | undefined;

      /**
       * Gets the first contact in the world. Use {@link Contact.GetNext} for the
       * rest. Contacts come and go during a time step, so use a
       * {@link ContactListener} not to miss any.
       *
       * @returns The first contact, or `nil` if there is none.
       */
      GetContactList(): Contact | undefined;

      /**
       * Gets the first joint in the world. Use {@link Joint.GetNext} for the rest.
       *
       * @returns The first joint, or `nil` if there is none.
       */
      GetJointList(): Joint | undefined;

      /**
       * Enables or disables sleep.
       *
       * @param flag - `true` allows bodies to sleep.
       */
      SetAllowSleeping(flag: boolean): void;

      /**
       * Whether bodies may sleep.
       *
       * @returns `true` if sleep is allowed.
       */
      GetAllowSleeping(): boolean;

      /**
       * Enables or disables warm starting. For testing.
       *
       * @param flag - `true` enables it.
       */
      SetWarmStarting(flag: boolean): void;

      /**
       * Whether warm starting is enabled.
       *
       * @returns `true` if it is.
       */
      GetWarmStarting(): boolean;

      /**
       * Enables or disables continuous physics. For testing.
       *
       * @param flag - `true` enables it.
       */
      SetContinuousPhysics(flag: boolean): void;

      /**
       * Whether continuous physics is enabled.
       *
       * @returns `true` if it is.
       */
      GetContinuousPhysics(): boolean;

      /**
       * Enables or disables single-stepped continuous physics. For testing.
       *
       * @param flag - `true` enables it.
       */
      SetSubStepping(flag: boolean): void;

      /**
       * Whether single-stepped continuous physics is enabled.
       *
       * @returns `true` if it is.
       */
      GetSubStepping(): boolean;

      /**
       * Gets the number of broad-phase proxies.
       *
       * @returns The count.
       */
      GetProxyCount(): number;

      /**
       * Gets the number of bodies.
       *
       * @returns The count.
       */
      GetBodyCount(): number;

      /**
       * Gets the number of joints.
       *
       * @returns The count.
       */
      GetJointCount(): number;

      /**
       * Gets the number of contacts, each with zero or more contact points.
       *
       * @returns The count.
       */
      GetContactCount(): number;

      /**
       * Gets the height of the dynamic tree.
       *
       * @returns The height.
       */
      GetTreeHeight(): number;

      /**
       * Gets the balance of the dynamic tree.
       *
       * @returns The balance.
       */
      GetTreeBalance(): number;

      /**
       * Gets the quality metric of the dynamic tree. Smaller is better; the minimum is 1.
       *
       * @returns The quality.
       */
      GetTreeQuality(): number;

      /**
       * Changes the global gravity vector.
       *
       * @param gravity - The gravity.
       */
      SetGravity(gravity: Vector3): void;

      /**
       * Gets the global gravity vector.
       *
       * @returns The gravity.
       */
      GetGravity(): Vector3;

      /**
       * Whether the world is in the middle of a time step.
       *
       * @returns `true` if it is locked.
       */
      IsLocked(): boolean;

      /**
       * Sets whether forces clear automatically after each time step.
       *
       * @param flag - `true` clears them.
       */
      SetAutoClearForces(flag: boolean): void;

      /**
       * Whether forces clear automatically after each time step.
       *
       * @returns `true` if they do.
       */
      GetAutoClearForces(): boolean;

      /**
       * Shifts the world origin, for large worlds. Each body's position becomes
       * `position - newOrigin`.
       *
       * @param newOrigin - The new origin relative to the old one.
       */
      ShiftOrigin(newOrigin: Vector3): void;

      /**
       * Gets the profile of the last step.
       *
       * @returns The times spent in each phase.
       */
      GetProfile(): Profile;

      /** Dumps the world to the log. Call it outside a time step. Not supported on Android or iOS. */
      Dump(): void;

      /** Destroys the world with its bodies, fixtures, joints, contacts and listeners. */
      Destroy(): void;
    }

    /**
     * Creates a world.
     *
     * @param gravity - The gravity vector. Default is no gravity.
     * @returns The world.
     */
    function NewWorld(gravity?: Vector3): World;

    /**
     * Creates a debug draw to register with {@link World.SetDebugDraw}. Its
     * callbacks run in the script instance that created it; call
     * {@link DebugDraw.Destroy} when it is no longer needed.
     *
     * @param data - The flags and the drawing callbacks.
     * @returns The debug draw.
     */
    function NewDebugDraw(data: DebugDrawCallbacks): DebugDraw;

    /**
     * Creates an empty polygon shape. Give it vertices with
     * {@link PolygonShape.Set} or {@link PolygonShape.SetAsBox}.
     *
     * @returns The shape.
     */
    function NewPolygonShape(): PolygonShape;

    /**
     * Creates a circle shape with a radius of 0.
     *
     * @returns The shape.
     */
    function NewCircleShape(): CircleShape;

    /**
     * Creates an empty chain shape. Give it vertices with
     * {@link ChainShape.CreateLoop} or {@link ChainShape.CreateChain}.
     *
     * @returns The shape.
     */
    function NewChainShape(): ChainShape;

    /**
     * Creates an edge shape. Give it vertices with {@link EdgeShape.SetTwoSided}
     * or {@link EdgeShape.SetOneSided}.
     *
     * @returns The shape.
     */
    function NewEdgeShape(): EdgeShape;

    /**
     * Computes linear stiffness and damping from a frequency and a damping ratio.
     *
     * @param frequencyHertz - The frequency in hertz.
     * @param dampingRatio - The damping ratio.
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @returns `stiffness` and `damping`.
     */
    function b2LinearStiffness(
      frequencyHertz: number,
      dampingRatio: number,
      bodyA: Body,
      bodyB: Body,
    ): LuaMultiReturn<[stiffness: number, damping: number]>;

    /**
     * Computes angular stiffness and damping from a frequency and a damping ratio.
     *
     * @param frequencyHertz - The frequency in hertz.
     * @param dampingRatio - The damping ratio.
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @returns `stiffness` and `damping`.
     */
    function b2AngularStiffness(
      frequencyHertz: number,
      dampingRatio: number,
      bodyA: Body,
      bodyB: Body,
    ): LuaMultiReturn<[stiffness: number, damping: number]>;

    /**
     * Fills a revolute joint definition: the bodies, the local anchors and the
     * reference angle, from a world anchor.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchor - The world anchor.
     * @returns The definition.
     */
    function InitializeRevoluteJointDef(
      bodyA: Body,
      bodyB: Body,
      anchor: Vector3,
    ): RevoluteJointDef;

    /**
     * Fills a prismatic joint definition: the bodies, the local anchors, the
     * axis and the reference angle, from a world anchor and a unit world axis.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchor - The world anchor.
     * @param axis - The unit world axis.
     * @returns The definition.
     */
    function InitializePrismaticJointDef(
      bodyA: Body,
      bodyB: Body,
      anchor: Vector3,
      axis: Vector3,
    ): PrismaticJointDef;

    /**
     * Fills a distance joint definition: the bodies, the local anchors and the
     * rest length, from world anchors. The minimum and maximum lengths are set
     * to the rest length.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchorA - The world anchor on bodyA.
     * @param anchorB - The world anchor on bodyB.
     * @returns The definition.
     */
    function InitializeDistanceJointDef(
      bodyA: Body,
      bodyB: Body,
      anchorA: Vector3,
      anchorB: Vector3,
    ): DistanceJointDef;

    /**
     * Fills a pulley joint definition: the bodies, the anchors, the lengths and
     * the ratio, from world anchors.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param groundAnchorA - The world ground anchor for bodyA.
     * @param groundAnchorB - The world ground anchor for bodyB.
     * @param anchorA - The world anchor on bodyA.
     * @param anchorB - The world anchor on bodyB.
     * @param ratio - The pulley ratio.
     * @returns The definition.
     */
    function InitializePulleyJointDef(
      bodyA: Body,
      bodyB: Body,
      groundAnchorA: Vector3,
      groundAnchorB: Vector3,
      anchorA: Vector3,
      anchorB: Vector3,
      ratio: number,
    ): PulleyJointDef;

    /**
     * Fills a mouse joint definition with the two bodies.
     *
     * @param bodyA - The first body.
     * @param bodyB - The body that tracks the target.
     * @returns The definition.
     */
    function InitializeMouseJointDef(bodyA: Body, bodyB: Body): MouseJointDef;

    /**
     * Fills a gear joint definition with the two bodies and the two joints it
     * connects.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param joint1 - The first revolute or prismatic joint.
     * @param joint2 - The second revolute or prismatic joint.
     * @returns The definition.
     */
    function InitializeGearJointDef(
      bodyA: Body,
      bodyB: Body,
      joint1: Joint,
      joint2: Joint,
    ): GearJointDef;

    /**
     * Fills a wheel joint definition: the bodies, the local anchors and the
     * axis, from a world anchor and a world axis.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchor - The world anchor.
     * @param axis - The world axis.
     * @returns The definition.
     */
    function InitializeWheelJointDef(
      bodyA: Body,
      bodyB: Body,
      anchor: Vector3,
      axis: Vector3,
    ): WheelJointDef;

    /**
     * Fills a weld joint definition: the bodies, the local anchors and the
     * reference angle, from a world anchor.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchor - The world anchor.
     * @returns The definition.
     */
    function InitializeWeldJointDef(bodyA: Body, bodyB: Body, anchor: Vector3): WeldJointDef;

    /**
     * Fills a friction joint definition: the bodies and the local anchors, from
     * a world anchor.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @param anchor - The world anchor.
     * @returns The definition.
     */
    function InitializeFrictionJointDef(
      bodyA: Body,
      bodyB: Body,
      anchor: Vector3,
    ): FrictionJointDef;

    /**
     * Fills a motor joint definition: the bodies and the offsets, from their
     * current transforms.
     *
     * @param bodyA - The first body.
     * @param bodyB - The second body.
     * @returns The definition.
     */
    function InitializeMotorJointDef(bodyA: Body, bodyB: Body): MotorJointDef;
  }
}

export {};
