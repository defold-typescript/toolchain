/** @noSelfInFile */
import type { Hash, Url, Vector3 } from "../src/core-types";

declare global {
  /**
   * Collision object physics API documentation
   */
  namespace physics {
    type event = BuiltinMessages["contact_point_event"] | BuiltinMessages["collision_event"] | BuiltinMessages["trigger_event"] | BuiltinMessages["ray_cast_response"] | BuiltinMessages["ray_cast_missed"];
    /**
     * The available fields depend on the joint type.
     */
    interface joint_properties {
      /**
       * whether the connected objects should collide
       */
      collide_connected?: boolean;
      /**
       * Natural spring length between the anchor points.
       */
      length?: number;
      /**
       * Mass-spring-damper frequency in Hertz; zero disables softness.
       */
      frequency?: number;
      /**
       * Damping ratio, where zero is no damping and one is critical damping.
       */
      damping?: number;
      /**
       * Maximum fixed-joint rope length.
       */
      max_length?: number;
      /**
       * Local translation unit axis in the first body.
       */
      local_axis_a?: Vector3;
      /**
       * Angle of the second body relative to the first body, in radians.
       */
      reference_angle?: number;
      /**
       * Lower angular limit in radians.
       */
      lower_angle?: number;
      /**
       * Upper angular limit in radians.
       */
      upper_angle?: number;
      /**
       * Lower translation limit, usually in meters.
       */
      lower_translation?: number;
      /**
       * Upper translation limit, usually in meters.
       */
      upper_translation?: number;
      /**
       * Maximum motor torque used to reach the desired speed, usually in N-m.
       */
      max_motor_torque?: number;
      /**
       * Maximum motor force used to reach the desired speed.
       */
      max_motor_force?: number;
      /**
       * Desired motor speed.
       */
      motor_speed?: number;
      /**
       * Whether joint limits are enabled.
       */
      enable_limit?: boolean;
      /**
       * Whether the joint motor is enabled.
       */
      enable_motor?: boolean;
    }
    /**
     * The available optional fields depend on the joint type.
     */
    interface joint_properties_info {
      /**
       * whether the connected objects collide
       */
      collide_connected: boolean;
      /**
       * spring length
       */
      length?: number;
      /**
       * spring frequency
       */
      frequency?: number;
      /**
       * damping ratio
       */
      damping?: number;
      /**
       * fixed-joint maximum length
       */
      max_length?: number;
      /**
       * local joint axis
       */
      local_axis_a?: Vector3;
      /**
       * reference angle
       */
      reference_angle?: number;
      /**
       * lower angular limit
       */
      lower_angle?: number;
      /**
       * upper angular limit
       */
      upper_angle?: number;
      /**
       * lower translation limit
       */
      lower_translation?: number;
      /**
       * upper translation limit
       */
      upper_translation?: number;
      /**
       * maximum motor torque
       */
      max_motor_torque?: number;
      /**
       * maximum motor force
       */
      max_motor_force?: number;
      /**
       * motor speed
       */
      motor_speed?: number;
      /**
       * whether limits are enabled
       */
      enable_limit?: boolean;
      /**
       * whether the motor is enabled
       */
      enable_motor?: boolean;
      /**
       * Read-only current hinge angle in radians.
       */
      joint_angle?: number;
      /**
       * Read-only current hinge angular speed or slider/wheel translation speed.
       */
      joint_speed?: number;
      /**
       * Read-only current slider or wheel translation, usually in meters.
       */
      joint_translation?: number;
    }
    /**
     * Ray-cast options
     */
    interface raycast_options {
      /**
       * Return every hit instead of only the closest hit.
       */
      all?: boolean;
    }
    /**
     * The available geometry fields depend on `type`.
     */
    interface shape_data {
      /**
       * shape type
       */
      type: physics.SHAPE_TYPE;
      /**
       * sphere diameter or capsule pole diameter
       */
      diameter?: number;
      /**
       * box dimensions
       */
      dimensions?: Vector3;
      /**
       * capsule height
       */
      height?: number;
    }
    type JOINT_TYPE = typeof physics.JOINT_TYPE_FIXED | typeof physics.JOINT_TYPE_HINGE | typeof physics.JOINT_TYPE_SLIDER | typeof physics.JOINT_TYPE_SPRING | typeof physics.JOINT_TYPE_WELD | typeof physics.JOINT_TYPE_WHEEL;
    type SHAPE_TYPE = typeof physics.SHAPE_TYPE_BOX | typeof physics.SHAPE_TYPE_CAPSULE | typeof physics.SHAPE_TYPE_HULL | typeof physics.SHAPE_TYPE_MESH | typeof physics.SHAPE_TYPE_SPHERE;
    /**
     * Fixed joint; uses `max_length` from physics.joint_properties.
     */
    const JOINT_TYPE_FIXED: number & { readonly __brand: "physics.JOINT_TYPE_FIXED" };
    /**
     * Hinge joint; uses the angular-limit and motor fields from physics.joint_properties.
     */
    const JOINT_TYPE_HINGE: number & { readonly __brand: "physics.JOINT_TYPE_HINGE" };
    /**
     * Slider joint; uses the translation-limit and motor fields from physics.joint_properties.
     */
    const JOINT_TYPE_SLIDER: number & { readonly __brand: "physics.JOINT_TYPE_SLIDER" };
    /**
     * Spring joint; uses `length`, `frequency`, and `damping` from physics.joint_properties.
     */
    const JOINT_TYPE_SPRING: number & { readonly __brand: "physics.JOINT_TYPE_SPRING" };
    /**
     * Weld joint; uses `reference_angle`, `frequency`, and `damping` from physics.joint_properties.
     */
    const JOINT_TYPE_WELD: number & { readonly __brand: "physics.JOINT_TYPE_WELD" };
    /**
     * Wheel joint; uses the axis, motor, frequency, and damping fields from physics.joint_properties.
     */
    const JOINT_TYPE_WHEEL: number & { readonly __brand: "physics.JOINT_TYPE_WHEEL" };
    /**
     * Box shape.
     */
    const SHAPE_TYPE_BOX: number & { readonly __brand: "physics.SHAPE_TYPE_BOX" };
    /**
     * Capsule shape; supported only by 3D physics.
     */
    const SHAPE_TYPE_CAPSULE: number & { readonly __brand: "physics.SHAPE_TYPE_CAPSULE" };
    /**
     * Convex hull shape.
     */
    const SHAPE_TYPE_HULL: number & { readonly __brand: "physics.SHAPE_TYPE_HULL" };
    /**
     * Triangle mesh shape; supported only by the Bullet 3D backend.
     */
    const SHAPE_TYPE_MESH: number & { readonly __brand: "physics.SHAPE_TYPE_MESH" };
    /**
     * Sphere shape.
     */
    const SHAPE_TYPE_SPHERE: number & { readonly __brand: "physics.SHAPE_TYPE_SPHERE" };
    /**
     * Create a physics joint between two collision object components.
     * Note: Currently only supported in 2D physics.
     *
     * @param joint_type - the joint type
     * @param collisionobject_a - first collision object
     * @param joint_id - id of the joint
     * @param position_a - local position where to attach the joint on the first collision object
     * @param collisionobject_b - second collision object
     * @param position_b - local position where to attach the joint on the second collision object
     * @param properties - optional joint-specific properties
     */
    function create_joint(joint_type: physics.JOINT_TYPE, collisionobject_a: string | Hash | Url, joint_id: string | Hash, position_a: Vector3, collisionobject_b: string | Hash | Url, position_b: Vector3, properties?: physics.joint_properties): void;
    /**
     * Destroy an already physics joint. The joint has to be created before a
     * destroy can be issued.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     */
    function destroy_joint(collisionobject: string | Hash | Url, joint_id: string | Hash): void;
    /**
     * Get the gravity in runtime. The gravity returned is not global, it will return
     * the gravity for the collection that the function is called from.
     * Note: For 2D physics the z component will always be zero.
     *
     * @returns gravity vector of collection
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     let gravity = physics.get_gravity();
     *     // Inverse gravity!
     *     gravity = vmath.vector3(-gravity.x, -gravity.y, -gravity.z);
     *     physics.set_gravity(gravity);
     *   },
     * });
     * ```
     */
    function get_gravity(): Vector3;
    /**
     * Returns the group name of a collision object as a hash.
     *
     * @param url - the collision object to return the group of.
     * @returns hash value of the group.
     * @example
     * ```ts
     * function check_is_enemy(): boolean {
     *   const group = physics.get_group("#collisionobject");
     *   return group === hash("enemy");
     * }
     * ```
     */
    function get_group(url: string | Hash | Url): Hash;
    /**
     * Get a table for properties for a connected joint. The joint has to be created before
     * properties can be retrieved.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns joint properties
     */
    function get_joint_properties(collisionobject: string | Hash | Url, joint_id: string | Hash): physics.joint_properties_info;
    /**
     * Get the reaction force for a joint. The joint has to be created before
     * the reaction force can be calculated.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns reaction force for the joint
     */
    function get_joint_reaction_force(collisionobject: string | Hash | Url, joint_id: string | Hash): Vector3;
    /**
     * Get the reaction torque for a joint. The joint has to be created before
     * the reaction torque can be calculated.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns the reaction torque on bodyB in N*m.
     */
    function get_joint_reaction_torque(collisionobject: string | Hash | Url, joint_id: string | Hash): number;
    /**
     * Returns true if the specified group is set in the mask of a collision
     * object, false otherwise.
     *
     * @param url - the collision object to check the mask of.
     * @param group - the name of the group to check for.
     * @returns boolean value of the maskbit. 'true' if present, 'false' otherwise.
     * @example
     * ```ts
     * function is_invincible(): boolean {
     *   // check if the collisionobject would collide with the "bullet" group
     *   const invincible = physics.get_maskbit("#collisionobject", "bullet");
     *   return invincible;
     * }
     * ```
     */
    function get_maskbit(url: string | Hash | Url, group: string | Hash): boolean;
    /**
     * Gets collision shape data from a collision object
     *
     * @param url - the collision object.
     * @param shape - the name of the shape to get data for.
     * @returns collision shape data
     * @example
     * ```ts
     * function get_shape_meta() {
     *   const sphere = physics.get_shape("#collisionobject", "my_sphere_shape");
     *   // returns a table with sphere.diameter
     *   return sphere;
     * }
     * ```
     */
    function get_shape(url: string | Hash | Url, shape: string | Hash): physics.shape_data;
    /**
     * Ray casts are used to test for intersections against collision objects in the physics world.
     * Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
     * do not intersect with ray casts.
     * Which collision objects to hit is filtered by their collision groups and can be configured
     * through `groups`.
     * NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param options - optional ray-cast options
     * @returns It returns a list. If missed it returns `nil`. See ray_cast_response for details on the returned values.
     * @example
     * ```ts
     * function handle_result(hit: { fraction: number; position: Vector3; normal: Vector3; id: Hash; group: Hash; request_id: number }) {
     *   // act on the hit (see 'ray_cast_response')
     * }
     *
     * // How to perform a ray cast synchronously:
     * export default defineScript({
     *   init() {
     *     return { groups: [hash("world"), hash("enemy")] };
     *   },
     *
     *   update(self, dt) {
     *     // request ray cast
     *     const from = go.get_world_position();
     *     const to = vmath.vector3(from.x, from.y - 100, from.z);
     *     const results = physics.raycast(from, to, self.groups, { all: true });
     *     if (results !== undefined) {
     *       // with `all` set, the ray cast returns every hit as a list
     *       for (const result of Array.isArray(results) ? results : [results]) {
     *         handle_result(result);
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function raycast(from: Vector3, to: Vector3, groups: Hash[], options?: physics.raycast_options): BuiltinMessages["ray_cast_response"][] | BuiltinMessages["ray_cast_response"] | undefined;
    /**
     * Ray casts are used to test for intersections against collision objects in the physics world.
     * Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
     * do not intersect with ray casts.
     * Which collision objects to hit is filtered by their collision groups and can be configured
     * through `groups`.
     * The actual ray cast will be performed during the physics-update.
     *
     * - If an object is hit, the result will be reported via a ray_cast_response message.
     * - If there is no object hit, the result will be reported via a ray_cast_missed message.
     *
     * NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param request_id - a number in range [0,255]. It will be sent back in the response for identification, 0 by default
     * @example
     * ```ts
     * // How to perform a ray cast asynchronously:
     * export default defineScript({
     *   init() {
     *     return { my_groups: [hash("my_group1"), hash("my_group2")] };
     *   },
     *
     *   update(self, dt) {
     *     // request ray cast
     *     const my_start = go.get_world_position();
     *     const my_end = vmath.vector3(my_start.x, my_start.y - 100, my_start.z);
     *     physics.raycast_async(my_start, my_end, self.my_groups);
     *   },
     *
     *   on_message(self, message_id, message, sender) {
     *     // check for the response
     *     if (message_id === hash("ray_cast_response")) {
     *       // act on the hit
     *     } else if (message_id === hash("ray_cast_missed")) {
     *       // act on the miss
     *     }
     *   },
     * });
     * ```
     */
    function raycast_async(from: Vector3, to: Vector3, groups: Hash[], request_id?: number): void;
    /**
     * Only one physics world event listener can be set at a time.
     *
     * @param callback - A callback that receives information about all physics interactions in this physics world. Pass `nil` to remove the listener.
     *
     * `self`
     * script_instance The calling script instance
     * `events`
     * physics.event[] An array of event tables. Each event table contains a `type` field with the hashed name of one of these messages, together with fields specific to that event type:
     *
     * - contact_point_event
     * - collision_event
     * - trigger_event
     * - ray_cast_response
     * - ray_cast_missed
     * @example
     * ```ts
     * function physics_world_listener(self: unknown, events: unknown) {
     *   for (const event of events as Record<string, unknown>[]) {
     *     const event_type = event["type"];
     *     if (event_type === hash("contact_point_event")) {
     *       pprint(event);
     *       // {
     *       //  distance = 2.1490633487701,
     *       //  applied_impulse = 0
     *       //  a = { --[[0x113f7c6c0]]
     *       //    group = hash: [box],
     *       //    id = hash: [/box]
     *       //    mass = 0,
     *       //    normal = vmath.vector3(0.379, 0.925, -0),
     *       //    position = vmath.vector3(517.337, 235.068, 0),
     *       //    instance_position = vmath.vector3(480, 144, 0),
     *       //    relative_velocity = vmath.vector3(-0, -0, -0),
     *       //  },
     *       //  b = { --[[0x113f7c840]]
     *       //    group = hash: [circle],
     *       //    id = hash: [/circle]
     *       //    mass = 0,
     *       //    normal = vmath.vector3(-0.379, -0.925, 0),
     *       //    position = vmath.vector3(517.337, 235.068, 0),
     *       //    instance_position = vmath.vector3(-0.0021, 0, -0.0022),
     *       //    relative_velocity = vmath.vector3(0, 0, 0),
     *       //  },
     *       // }
     *     } else if (event_type === hash("collision_event")) {
     *       pprint(event);
     *       // {
     *       //  a = {
     *       //          group = hash: [default],
     *       //          position = vmath.vector3(183, 666, 0),
     *       //          id = hash: [/go1]
     *       //      },
     *       //  b = {
     *       //          group = hash: [default],
     *       //          position = vmath.vector3(185, 704.05865478516, 0),
     *       //          id = hash: [/go2]
     *       //      }
     *       // }
     *     } else if (event_type === hash("trigger_event")) {
     *       pprint(event);
     *       // {
     *       //  enter = true,
     *       //  b = {
     *       //      group = hash: [default],
     *       //      id = hash: [/go2]
     *       //  },
     *       //  a = {
     *       //      group = hash: [default],
     *       //      id = hash: [/go1]
     *       //  }
     *       // },
     *     } else if (event_type === hash("ray_cast_response")) {
     *       pprint(event);
     *       // {
     *       //  group = hash: [default],
     *       //  request_id = 0,
     *       //  position = vmath.vector3(249.92222595215, 249.92222595215, 0),
     *       //  fraction = 0.68759721517563,
     *       //  normal = vmath.vector3(0, 1, 0),
     *       //  id = hash: [/go]
     *       // }
     *     } else if (event_type === hash("ray_cast_missed")) {
     *       pprint(event);
     *       // {
     *       //  request_id = 0
     *       // },
     *     }
     *   }
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     physics.set_event_listener(physics_world_listener);
     *   },
     * });
     * ```
     */
    function set_event_listener(callback?: (self: unknown, events: physics.event[]) => void): void;
    /**
     * Set the gravity in runtime. The gravity change is not global, it will only affect
     * the collection that the function is called from.
     * Note: For 2D physics the z component of the gravity vector will be ignored.
     *
     * @param gravity - the new gravity vector
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     // Set "upside down" gravity for this collection.
     *     physics.set_gravity(vmath.vector3(0, 10.0, 0));
     *   },
     * });
     * ```
     */
    function set_gravity(gravity: Vector3): void;
    /**
     * Updates the group property of a collision object to the specified
     * string value. The group name should exist i.e. have been used in
     * a collision object in the editor.
     *
     * @param url - the collision object affected.
     * @param group - the new group name to be assigned.
     * @example
     * ```ts
     * function change_collision_group() {
     *   physics.set_group("#collisionobject", "enemy");
     * }
     * ```
     */
    function set_group(url: string | Hash | Url, group: string | Hash): void;
    /**
     * Flips the collision shapes horizontally for a collision object
     *
     * @param url - the collision object that should flip its shapes
     * @param flip - `true` if the collision object should flip its shapes, `false` if not
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const fliph = true; // set on some condition
     *     physics.set_hflip("#collisionobject", fliph);
     *     return { fliph };
     *   },
     * });
     * ```
     */
    function set_hflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * Updates the properties for an already connected joint. The joint has to be created before
     * properties can be changed.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @param properties - joint specific properties table
     * Note: The `collide_connected` field cannot be updated/changed after a connection has been made.
     */
    function set_joint_properties(collisionobject: string | Hash | Url, joint_id: string | Hash, properties: physics.joint_properties): void;
    /**
     * Sets or clears the masking of a group (maskbit) in a collision object.
     *
     * @param url - the collision object to change the mask of.
     * @param group - the name of the group (maskbit) to modify in the mask.
     * @param maskbit - boolean value of the new maskbit. 'true' to enable, 'false' to disable.
     * @example
     * ```ts
     * function make_invincible() {
     *   // no longer collide with the "bullet" group
     *   physics.set_maskbit("#collisionobject", "bullet", false);
     * }
     * ```
     */
    function set_maskbit(url: string | Hash | Url, group: string | Hash, maskbit: boolean): void;
    /**
     * Sets collision shape data for a collision object. Please note that updating data in 3D
     * can be quite costly for box and capsules. Because of the physics engine, the cost
     * comes from having to recreate the shape objects when certain shapes needs to be updated.
     *
     * @param url - the collision object.
     * @param shape - the name of the shape to get data for.
     * @param table - updated collision shape data
     * Hull and mesh geometry cannot be changed with this function.
     * @example
     * ```ts
     * function set_shape_data() {
     *   // set capsule shape data
     *   physics.set_shape("#collisionobject", "my_capsule_shape", {
     *     type: physics.SHAPE_TYPE_CAPSULE,
     *     diameter: 10,
     *     height: 20,
     *   });
     *
     *   // set sphere shape data
     *   physics.set_shape("#collisionobject", "my_sphere_shape", {
     *     type: physics.SHAPE_TYPE_SPHERE,
     *     diameter: 10,
     *   });
     *
     *   // set box shape data
     *   physics.set_shape("#collisionobject", "my_box_shape", {
     *     type: physics.SHAPE_TYPE_BOX,
     *     dimensions: vmath.vector3(10, 10, 5),
     *   });
     * }
     * ```
     */
    function set_shape(url: string | Hash | Url, shape: string | Hash, table: physics.shape_data): void;
    /**
     * Flips the collision shapes vertically for a collision object
     *
     * @param url - the collision object that should flip its shapes
     * @param flip - `true` if the collision object should flip its shapes, `false` if not
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const flipv = true; // set on some condition
     *     physics.set_vflip("#collisionobject", flipv);
     *     return { flipv };
     *   },
     * });
     * ```
     */
    function set_vflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * The function recalculates the density of each shape based on the total area of all shapes and the specified mass, then updates the mass of the body accordingly.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - the collision object whose mass needs to be updated.
     * @param mass - the new mass value to set for the collision object.
     * @example
     * ```ts
     * physics.update_mass("#collisionobject", 14);
     * ```
     */
    function update_mass(collisionobject: string | Hash | Url, mass: number): void;
    /**
     * Collision objects tend to fall asleep when inactive for a small period of time for
     * efficiency reasons. This function wakes them up.
     *
     * @param url - the collision object to wake.
     * @example
     * ```ts
     * export default defineScript({
     *   on_input(self, action_id, action) {
     *     if (action_id === hash("test") && action.pressed) {
     *       physics.wakeup("#collisionobject");
     *     }
     *   },
     * });
     * ```
     */
    function wakeup(url: string | Hash | Url): void;
    namespace message {
      namespace physics {
        /**
         * collision object information
         */
        interface collision_info {
          /**
           * object position in world space
           */
          position: Vector3;
          /**
           * object identifier
           */
          id: Hash;
          /**
           * object collision group
           */
          group: Hash;
        }
        /**
         * contact-point object information
         */
        interface contact_point_info {
          /**
           * contact point position in world space
           */
          position: Vector3;
          /**
           * object position in world space
           */
          instance_position: Vector3;
          /**
           * contact normal pointing from the other object toward this object
           */
          normal: Vector3;
          /**
           * object velocity relative to the other object
           */
          relative_velocity: Vector3;
          /**
           * object mass in kilograms
           */
          mass: number;
          /**
           * object identifier
           */
          id: Hash;
          /**
           * object collision group
           */
          group: Hash;
        }
        /**
         * trigger interaction object information
         */
        interface trigger_info {
          /**
           * object identifier
           */
          id: Hash;
          /**
           * object collision group
           */
          group: Hash;
        }
      }
    }
    interface properties {
      /**
       * The angular damping value for the collision object. Setting this value alters the damping of
       * angular motion of the object (rotation). Valid values are between 0 (no damping) and 1 (full damping).
       */
      angular_damping: number;
      /**
       * The current angular velocity of the collision object component as a vector3.
       * The velocity is measured as a rotation around the vector with a speed equivalent to the vector length
       * in radians/s.
       */
      angular_velocity: Vector3;
      /**
       * The linear damping value for the collision object. Setting this value alters the damping of
       * linear motion of the object. Valid values are between 0 (no damping) and 1 (full damping).
       */
      linear_damping: number;
      /**
       * The current linear velocity of the collision object component as a vector3.
       * The velocity is measured in units/s (pixels/s).
       */
      linear_velocity: Vector3;
      /**
       * READ ONLY Returns the defined physical mass of the collision object component as a number.
       */
      readonly mass: number;
    }
  }
}

export {};
