/** @noSelfInFile */
import type { Hash, Vector3 } from "../../src/core-types";

declare global {
  /**
   * Collision object physics API documentation
   */
  namespace physics {
    type event = BuiltinMessages["contact_point_event"] & { type: Hash<"contact_point_event"> } | BuiltinMessages["collision_event"] & { type: Hash<"collision_event"> } | BuiltinMessages["trigger_event"] & { type: Hash<"trigger_event"> } | BuiltinMessages["ray_cast_response"] & { type: Hash<"ray_cast_response"> } | BuiltinMessages["ray_cast_missed"] & { type: Hash<"ray_cast_missed"> };
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
      type: physics.ShapeType;
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
    type JointType = typeof physics.JOINT_TYPE_FIXED | typeof physics.JOINT_TYPE_HINGE | typeof physics.JOINT_TYPE_SLIDER | typeof physics.JOINT_TYPE_SPRING | typeof physics.JOINT_TYPE_WELD | typeof physics.JOINT_TYPE_WHEEL;
    type ShapeType = typeof physics.SHAPE_TYPE_BOX | typeof physics.SHAPE_TYPE_CAPSULE | typeof physics.SHAPE_TYPE_HULL | typeof physics.SHAPE_TYPE_MESH | typeof physics.SHAPE_TYPE_SPHERE;
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
