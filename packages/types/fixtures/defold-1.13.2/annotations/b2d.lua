--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.b2d
---Functions for interacting with Box2D.
---@field body defold_api.b2d.body
---@field chain defold_api.b2d.chain
---@field fixture defold_api.b2d.fixture
---@field joint defold_api.b2d.joint
---@field shape defold_api.b2d.shape
---@field world defold_api.b2d.world
b2d = {}

---@class defold_api.b2d.body
---Dynamic body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.B2)
---@field B2_DYNAMIC_BODY b2d.body.B2
---Kinematic body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.B2)
---@field B2_KINEMATIC_BODY b2d.body.B2
---Static (immovable) body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.B2)
---@field B2_STATIC_BODY b2d.body.B2
b2d.body = {}

---@class defold_api.b2d.chain
b2d.chain = {}

---@class defold_api.b2d.fixture
b2d.fixture = {}

---@class defold_api.b2d.joint
---Distance joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_DISTANCE b2d.joint.JOINT_TYPE
---Filter joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_FILTER b2d.joint.JOINT_TYPE
---Friction joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_FRICTION b2d.joint.JOINT_TYPE
---Gear joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_GEAR b2d.joint.JOINT_TYPE
---Motor joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_MOTOR b2d.joint.JOINT_TYPE
---Mouse joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_MOUSE b2d.joint.JOINT_TYPE
---Prismatic joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_PRISMATIC b2d.joint.JOINT_TYPE
---Pulley joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_PULLEY b2d.joint.JOINT_TYPE
---Revolute joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_REVOLUTE b2d.joint.JOINT_TYPE
---Rope joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_ROPE b2d.joint.JOINT_TYPE
---Unknown joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_UNKNOWN b2d.joint.JOINT_TYPE
---Weld joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_WELD b2d.joint.JOINT_TYPE
---Wheel joint type.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@field JOINT_TYPE_WHEEL b2d.joint.JOINT_TYPE
---At lower limit state.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.LIMIT_STATE)
---@field LIMIT_STATE_AT_LOWER b2d.joint.LIMIT_STATE
---At upper limit state.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.LIMIT_STATE)
---@field LIMIT_STATE_AT_UPPER b2d.joint.LIMIT_STATE
---Equal limits state.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.LIMIT_STATE)
---@field LIMIT_STATE_EQUAL b2d.joint.LIMIT_STATE
---Inactive limit state.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.LIMIT_STATE)
---@field LIMIT_STATE_INACTIVE b2d.joint.LIMIT_STATE
b2d.joint = {}

---@class defold_api.b2d.shape
---Box shape type alias. Uses the polygon enum value, but indicates the `hx`/`hy` box convenience format.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_BOX b2d.shape.SHAPE_TYPE
---Capsule shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_CAPSULE b2d.shape.SHAPE_TYPE
---Chain shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_CHAIN b2d.shape.SHAPE_TYPE
---Circle shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_CIRCLE b2d.shape.SHAPE_TYPE
---Edge shape type alias. Compatibility alias for `b2d.shape.SHAPE_TYPE_SEGMENT`.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_EDGE b2d.shape.SHAPE_TYPE
---Grid shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_GRID b2d.shape.SHAPE_TYPE
---Polygon shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_POLYGON b2d.shape.SHAPE_TYPE
---Segment shape type.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_SEGMENT b2d.shape.SHAPE_TYPE
b2d.shape = {}

---@class defold_api.b2d.world
b2d.world = {}

---@enum defold_enum.b2d.body.B2: integer
local __defold_enum_b2d_body_B2 = {
    B2_DYNAMIC_BODY = nil,
    B2_KINEMATIC_BODY = nil,
    B2_STATIC_BODY = nil,
}

---Body types
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.B2)
---@alias b2d.body.B2 defold_enum.b2d.body.B2
---| `b2d.body.B2_DYNAMIC_BODY`
---| `b2d.body.B2_KINEMATIC_BODY`
---| `b2d.body.B2_STATIC_BODY`

---@enum defold_enum.b2d.joint.JOINT_TYPE: integer
local __defold_enum_b2d_joint_JOINT_TYPE = {
    JOINT_TYPE_DISTANCE = nil,
    JOINT_TYPE_FILTER = nil,
    JOINT_TYPE_FRICTION = nil,
    JOINT_TYPE_GEAR = nil,
    JOINT_TYPE_MOTOR = nil,
    JOINT_TYPE_MOUSE = nil,
    JOINT_TYPE_PRISMATIC = nil,
    JOINT_TYPE_PULLEY = nil,
    JOINT_TYPE_REVOLUTE = nil,
    JOINT_TYPE_ROPE = nil,
    JOINT_TYPE_UNKNOWN = nil,
    JOINT_TYPE_WELD = nil,
    JOINT_TYPE_WHEEL = nil,
}

---Box2D joint types.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.JOINT_TYPE)
---@alias b2d.joint.JOINT_TYPE defold_enum.b2d.joint.JOINT_TYPE
---| `b2d.joint.JOINT_TYPE_DISTANCE`
---| `b2d.joint.JOINT_TYPE_FILTER`
---| `b2d.joint.JOINT_TYPE_FRICTION`
---| `b2d.joint.JOINT_TYPE_GEAR`
---| `b2d.joint.JOINT_TYPE_MOTOR`
---| `b2d.joint.JOINT_TYPE_MOUSE`
---| `b2d.joint.JOINT_TYPE_PRISMATIC`
---| `b2d.joint.JOINT_TYPE_PULLEY`
---| `b2d.joint.JOINT_TYPE_REVOLUTE`
---| `b2d.joint.JOINT_TYPE_ROPE`
---| `b2d.joint.JOINT_TYPE_UNKNOWN`
---| `b2d.joint.JOINT_TYPE_WELD`
---| `b2d.joint.JOINT_TYPE_WHEEL`

---@enum defold_enum.b2d.joint.LIMIT_STATE: integer
local __defold_enum_b2d_joint_LIMIT_STATE = {
    LIMIT_STATE_AT_LOWER = nil,
    LIMIT_STATE_AT_UPPER = nil,
    LIMIT_STATE_EQUAL = nil,
    LIMIT_STATE_INACTIVE = nil,
}

---Box2D joint limit states.
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.LIMIT_STATE)
---@alias b2d.joint.LIMIT_STATE defold_enum.b2d.joint.LIMIT_STATE
---| `b2d.joint.LIMIT_STATE_AT_LOWER`
---| `b2d.joint.LIMIT_STATE_AT_UPPER`
---| `b2d.joint.LIMIT_STATE_EQUAL`
---| `b2d.joint.LIMIT_STATE_INACTIVE`

---@enum defold_enum.b2d.shape.SHAPE_TYPE: integer
local __defold_enum_b2d_shape_SHAPE_TYPE = {
    SHAPE_TYPE_BOX = nil,
    SHAPE_TYPE_CAPSULE = nil,
    SHAPE_TYPE_CHAIN = nil,
    SHAPE_TYPE_CIRCLE = nil,
    SHAPE_TYPE_EDGE = nil,
    SHAPE_TYPE_GRID = nil,
    SHAPE_TYPE_POLYGON = nil,
    SHAPE_TYPE_SEGMENT = nil,
}

---Box2D shape types.
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)
---@alias b2d.shape.SHAPE_TYPE defold_enum.b2d.shape.SHAPE_TYPE
---| `b2d.shape.SHAPE_TYPE_BOX`
---| `b2d.shape.SHAPE_TYPE_CAPSULE`
---| `b2d.shape.SHAPE_TYPE_CHAIN`
---| `b2d.shape.SHAPE_TYPE_CIRCLE`
---| `b2d.shape.SHAPE_TYPE_EDGE`
---| `b2d.shape.SHAPE_TYPE_GRID`
---| `b2d.shape.SHAPE_TYPE_POLYGON`
---| `b2d.shape.SHAPE_TYPE_SEGMENT`

---Apply an angular impulse.
---@param body b2Body body
---@param impulse number impulse the angular impulse in units of kg*m*m/s
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_angular_impulse:body-impulse)
function b2d.body.apply_angular_impulse(body, impulse) end

---Apply a force at a world point. If the force is not
---applied at the center of mass, it will generate a torque and
---affect the angular velocity. This wakes up the body.
---@param body b2Body body
---@param force vector3 the world force vector, usually in Newtons (N).
---@param point vector3 the world position of the point of application.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_force:body-force-point)
function b2d.body.apply_force(body, force, point) end

---Apply a force to the center of mass. This wakes up the body.
---@param body b2Body body
---@param force vector3 the world force vector, usually in Newtons (N).
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_force_to_center:body-force)
function b2d.body.apply_force_to_center(body, force) end

---Apply an impulse at a point. This immediately modifies the velocity.
---It also modifies the angular velocity if the point of application
---is not at the center of mass. This wakes up the body.
---@param body b2Body body
---@param impulse vector3 the world impulse vector, usually in N-seconds or kg-m/s.
---@param point vector3 the world position of the point of application.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_linear_impulse:body-impulse-point)
function b2d.body.apply_linear_impulse(body, impulse, point) end

---Apply a linear impulse to the center of mass.
---@param body b2Body body
---@param impulse vector3 world impulse vector
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_linear_impulse_to_center:body-impulse)
function b2d.body.apply_linear_impulse_to_center(body, impulse) end

---Apply a torque. This affects the angular velocity
---without affecting the linear velocity of the center of mass.
---This wakes up the body.
---@param body b2Body body
---@param torque number torque about the z-axis (out of the screen), usually in N-m.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.apply_torque:body-torque)
function b2d.body.apply_torque(body, torque) end

---Compute the world AABB of all body shapes.
---@param body b2Body body
---@return b2d.aabb aabb body bounds
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.compute_aabb:body)
function b2d.body.compute_aabb(body) end

---Chains are one-sided connected segments with optional ghost vertices at
---the ends of open chains. Ghost vertices are creation-time chain data only and
---cannot be added to arbitrary shapes, bodies, or joints after creation.
---
---**Examples:**
---
---```lua
---local chain, segments = b2d.body.create_chain(body, {
---    vertices = {
---        vmath.vector3(-64, 0, 0),
---        vmath.vector3(0, 16, 0),
---        vmath.vector3(64, 0, 0),
---    },
---    prev_vertex = vmath.vector3(-96, 0, 0),
---    next_vertex = vmath.vector3(96, 0, 0),
---    friction = 0.6,
---})
---```
---@param body b2Body body
---@param definition b2d.chain_definition the chain definition
---@return b2Chain chain created chain handle
---@return b2d.shape_info[] segments created chain segments
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.create_chain:body-definition)
function b2d.body.create_chain(body, definition) end

---Creates a fixture and attach it to this body. Use this function if you need
---to set some fixture parameters, like friction. Otherwise you can create the
---fixture directly from a shape.
---If the density is non-zero, this function automatically updates the mass of the body.
---Contacts are not created until the next time step.
---
---**Examples:**
---
---```lua
---local body = b2d.get_body("#collisionobject")
---
---local triangle = b2d.body.create_fixture(body, {
---    density = 1.0,
---    friction = 0.3,
---    shape = {
---        type = b2d.shape.SHAPE_TYPE_POLYGON,
---        vertices = {
---            vmath.vector3(-16, -16, 0),
---            vmath.vector3( 16, -16, 0),
---            vmath.vector3(  0,  16, 0),
---        },
---    },
---})
---```
---@overload fun(body:b2Body, shape:b2Shape, density:number)
---@param body b2Body body
---@param definition b2d.fixture_definition fixture definition
---@return b2d.fixture_info fixture fixture information
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.create_fixture:body-definition)
function b2d.body.create_fixture(body, definition) end

---Creates a shape and attaches it to this body.
---If the density is non-zero, this function automatically updates the mass of the body.
---Contacts are not created until the next time step.
---@param body b2Body body
---@param definition b2d.shape_create_definition the shape definition.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.create_shape:body-definition)
function b2d.body.create_shape(body, definition) end

---Destroy a fixture from a body.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.destroy_fixture:body-fixture_index)
function b2d.body.destroy_fixture(body, fixture_index) end

---Destroy a shape. This removes the shape from the broad-phase and
---destroys all contacts associated with this shape. This will
---automatically adjust the mass of the body if the body is dynamic and the
---shape has positive density.
---All shapes attached to a body are implicitly destroyed when the body is destroyed.
---@param body b2Body body
---@param shape_index integer 1-based shape index from `b2d.body.get_shapes`
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.destroy_shape:body-shape_index)
function b2d.body.destroy_shape(body, shape_index) end

---Print the body representation to the log output
---@param body b2Body body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.dump:body)
function b2d.body.dump(body) end

---Enable or disable contact events on all body shapes.
---@param body b2Body body
---@param enable boolean true to enable contact events
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.enable_contact_events:body-enable)
function b2d.body.enable_contact_events(body, enable) end

---Enable or disable hit events on all body shapes.
---@param body b2Body body
---@param enable boolean true to enable hit events
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.enable_hit_events:body-enable)
function b2d.body.enable_hit_events(body, enable) end

---You can disable sleeping on this body. If you disable sleeping, the body will be woken.
---@param body b2Body body
---@param enable boolean if false, the body will never sleep, and consume more CPU
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.enable_sleep:body-enable)
function b2d.body.enable_sleep(body, enable) end

---Get the angle in radians.
---@param body b2Body body
---@return number angle the current world rotation angle in radians.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_angle:body)
function b2d.body.get_angle(body) end

---Get the angular damping of the body.
---@param body b2Body body
---@return number damping the damping
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_angular_damping:body)
function b2d.body.get_angular_damping(body) end

---Get the angular velocity.
---@param body b2Body body
---@return number velocity the angular velocity in radians/second.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_angular_velocity:body)
function b2d.body.get_angular_velocity(body) end

---Get touching contact data for a body.
---@param body b2Body body
---@return b2d.contact_data[] contacts array of contact tables
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_contact_data:body)
function b2d.body.get_contact_data(body) end

---Get the fixtures attached to this body.
---@param body b2Body body
---@return b2d.fixture_info[] fixtures the attached fixtures
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_fixtures:body)
function b2d.body.get_fixtures(body) end

---Get the total force currently applied on this object
---@param body b2Body body
---@return vector3 force
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_force:body)
function b2d.body.get_force(body) end

---Get the gravity scale of the body.
---@param body b2Body body
---@return number scale the scale
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_gravity_scale:body)
function b2d.body.get_gravity_scale(body) end

---Get the rotational inertia of the body about the local origin.
---@param body b2Body body
---@return number inertia the rotational inertia, usually in kg-m^2.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_inertia:body)
function b2d.body.get_inertia(body) end

---Get the joints attached to this body.
---@param body b2Body body
---@return b2Joint[] joints joint handles created by `b2d.joint`
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_joints:body)
function b2d.body.get_joints(body) end

---Get the linear damping of the body.
---@param body b2Body body
---@return number damping the damping
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_linear_damping:body)
function b2d.body.get_linear_damping(body) end

---Get the linear velocity of the center of mass.
---@param body b2Body body
---@return vector3 velocity the linear velocity of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_linear_velocity:body)
function b2d.body.get_linear_velocity(body) end

---Get the world velocity of a local point.
---@param body b2Body body
---@param local_point vector3 a point in local coordinates.
---@return vector3 velocity the world velocity of a point.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_linear_velocity_from_local_point:body-local_point)
function b2d.body.get_linear_velocity_from_local_point(body, local_point) end

---Get the world linear velocity of a world point attached to this body.
---@param body b2Body body
---@param world_point vector3 a point in world coordinates.
---@return vector3 velocity the world velocity of a point.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_linear_velocity_from_world_point:body-world_point)
function b2d.body.get_linear_velocity_from_world_point(body, world_point) end

---Get the local position of the center of mass.
---@param body b2Body body
---@return vector3 center Get the local position of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_local_center:body)
function b2d.body.get_local_center(body) end

---Get the local position of the center of mass.
---@param body b2Body body
---@return vector3 center Get the local position of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_local_center_of_mass:body)
function b2d.body.get_local_center_of_mass(body) end

---Gets a local point relative to the body's origin given a world point.
---@param body b2Body body
---@param world_point vector3 a point in world coordinates.
---@return vector3 vector the corresponding local point relative to the body's origin.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_local_point:body-world_point)
function b2d.body.get_local_point(body, world_point) end

---Gets a local vector given a world vector.
---@param body b2Body body
---@param world_vector vector3 a vector in world coordinates.
---@return vector3 vector the corresponding local vector.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_local_vector:body-world_vector)
function b2d.body.get_local_vector(body, world_vector) end

---Get the total mass of the body.
---@param body b2Body body
---@return number mass the mass, usually in kilograms (kg).
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_mass:body)
function b2d.body.get_mass(body) end

---Get the mass data of the body.
---@param body b2Body body
---@return b2d.mass_data data the mass data
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_mass_data:body)
function b2d.body.get_mass_data(body) end

---Get the body name.
---@param body b2Body body
---@return string|nil name body name, or `nil` if no name is set
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_name:body)
function b2d.body.get_name(body) end

---Get the next body in the world's body list.
---@param body b2Body body
---@return b2Body|nil body the next body, or `nil` if this is the last body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_next:body)
function b2d.body.get_next(body) end

---Get the world body origin position.
---@param body b2Body body
---@return vector3 position the world position of the body's origin.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_position:body)
function b2d.body.get_position(body) end

---Get the rotational inertia of the body about the local origin.
---@param body b2Body body
---@return number inertia the rotational inertia, usually in kg-m^2.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_rotational_inertia:body)
function b2d.body.get_rotational_inertia(body) end

---Get the list of all shapes attached to this body.
---@param body b2Body body
---@return b2d.shape_info[] shapes attached shapes
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_shapes:body)
function b2d.body.get_shapes(body) end

---Get the sleep velocity threshold.
---@param body b2Body body
---@return number threshold velocity threshold in Defold units per second
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_sleep_threshold:body)
function b2d.body.get_sleep_threshold(body) end

---Get the body transform for the body's origin.
---@param body b2Body body
---@return b2d.transform transform the body transform
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_transform:body)
function b2d.body.get_transform(body) end

---Get the type of this body.
---@param body b2Body body
---@return b2d.body.B2 type the body type
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_type:body)
function b2d.body.get_type(body) end

---Get the user data pointer that was provided in the body definition.
---@param body b2Body body
---@return hash id the game object id this body is connected to
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_user_data:body)
function b2d.body.get_user_data(body) end

---Get the parent world of this body.
---@param body b2Body body
---@return b2World world
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_world:body)
function b2d.body.get_world(body) end

---Get the world position of the center of mass.
---@param body b2Body body
---@return vector3 center Get the world position of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_world_center:body)
function b2d.body.get_world_center(body) end

---Get the world position of the center of mass.
---@param body b2Body body
---@return vector3 center Get the world position of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_world_center_of_mass:body)
function b2d.body.get_world_center_of_mass(body) end

---Get the world coordinates of a point given the local coordinates.
---@param body b2Body body
---@param local_vector vector3 localPoint a point on the body measured relative the the body's origin.
---@return vector3 vector the same point expressed in world coordinates.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_world_point:body-local_vector)
function b2d.body.get_world_point(body, local_vector) end

---Get the world coordinates of a vector given the local coordinates.
---@param body b2Body body
---@param local_vector vector3 a vector fixed in the body.
---@return vector3 vector the same vector expressed in world coordinates.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.get_world_vector:body-local_vector)
function b2d.body.get_world_vector(body, local_vector) end

---Get the active state of the body.
---@param body b2Body body
---@return boolean enabled is the body active
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_active:body)
function b2d.body.is_active(body) end

---Get the sleeping state of this body.
---@param body b2Body body
---@return boolean enabled true if the body is awake, false if it's sleeping.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_awake:body)
function b2d.body.is_awake(body) end

---Is this body in bullet mode
---@param body b2Body body
---@return boolean enabled true if the body is in bullet mode
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_bullet:body)
function b2d.body.is_bullet(body) end

---Does this body have fixed rotation?
---@param body b2Body body
---@return boolean enabled is the rotation fixed
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_fixed_rotation:body)
function b2d.body.is_fixed_rotation(body) end

---Is this body allowed to sleep
---@param body b2Body body
---@return boolean enabled true if the body is allowed to sleep
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_sleeping_allowed:body)
function b2d.body.is_sleeping_allowed(body) end

---Is this body allowed to sleep
---@param body b2Body body
---@return boolean enabled true if the body is allowed to sleep
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_sleeping_enabled:body)
function b2d.body.is_sleeping_enabled(body) end

---Validate a body handle.
---@param body b2Body body
---@return boolean valid true if the body handle still refers to a live Box2D body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.is_valid:body)
function b2d.body.is_valid(body) end

---This resets the mass properties to the sum of the mass properties of the fixtures.
---This normally does not need to be called unless you called SetMassData to override
---@param body b2Body body
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.reset_mass_data:body)
function b2d.body.reset_mass_data(body) end

---Set the active state of the body. An inactive body is not
---simulated and cannot be collided with or woken up.
---If you pass a flag of true, all fixtures will be added to the
---broad-phase.
---If you pass a flag of false, all fixtures will be removed from
---the broad-phase and all contacts will be destroyed.
---Fixtures and joints are otherwise unaffected. You may continue
---to create/destroy fixtures and joints on inactive bodies.
---Fixtures on an inactive body are implicitly inactive and will
---not participate in collisions, ray-casts, or queries.
---Joints connected to an inactive body are implicitly inactive.
---An inactive body is still owned by a b2World object and remains
---in the body list.
---@param body b2Body body
---@param enable boolean true if the body should be active
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_active:body-enable)
function b2d.body.set_active(body, enable) end

---Set the angular damping of the body.
---@param body b2Body body
---@param damping number the damping
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_angular_damping:body-damping)
function b2d.body.set_angular_damping(body, damping) end

---Set the angular velocity.
---@param body b2Body body
---@param omega number the new angular velocity in radians/second.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_angular_velocity:body-omega)
function b2d.body.set_angular_velocity(body, omega) end

---Set the sleep state of the body. A sleeping body has very low CPU cost.
---@param body b2Body body
---@param enable boolean flag set to false to put body to sleep, true to wake it.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_awake:body-enable)
function b2d.body.set_awake(body, enable) end

---Should this body be treated like a bullet for continuous collision detection?
---@param body b2Body body
---@param enable boolean if true, the body will be in bullet mode
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_bullet:body-enable)
function b2d.body.set_bullet(body, enable) end

---Set this body to have fixed rotation. This causes the mass to be reset.
---@param body b2Body body
---@param enable boolean true if the rotation should be fixed
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_fixed_rotation:body-enable)
function b2d.body.set_fixed_rotation(body, enable) end

---Set the gravity scale of the body.
---@param body b2Body body
---@param scale number the scale
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_gravity_scale:body-scale)
function b2d.body.set_gravity_scale(body, scale) end

---Set the linear damping of the body.
---@param body b2Body body
---@param damping number the damping
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_linear_damping:body-damping)
function b2d.body.set_linear_damping(body, damping) end

---Set the linear velocity of the center of mass.
---@param body b2Body body
---@param velocity vector3 the new linear velocity of the center of mass.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_linear_velocity:body-velocity)
function b2d.body.set_linear_velocity(body, velocity) end

---Set the mass properties to override the mass properties of the fixtures.
---@param body b2Body body
---@param data b2d.mass_data the mass data
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_mass_data:body-data)
function b2d.body.set_mass_data(body, data) end

---Set the body name.
---@param body b2Body body
---@param name string body name
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_name:body-name)
function b2d.body.set_name(body, name) end

---Set the sleep velocity threshold.
---@param body b2Body body
---@param threshold number velocity threshold in Defold units per second
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_sleep_threshold:body-threshold)
function b2d.body.set_sleep_threshold(body, threshold) end

---You can disable sleeping on this body. If you disable sleeping, the body will be woken.
---@param body b2Body body
---@param enable boolean if false, the body will never sleep, and consume more CPU
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_sleeping_allowed:body-enable)
function b2d.body.set_sleeping_allowed(body, enable) end

---Set velocity to reach a target transform.
---@param body b2Body body
---@param position vector3 target world position
---@param angle number target world angle in radians
---@param time_step number time step used to compute velocity
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_target_transform:body-position-angle-time_step)
function b2d.body.set_target_transform(body, position, angle, time_step) end

---Set the position of the body's origin and rotation.
---This breaks any contacts and wakes the other bodies.
---Manipulating a body's transform may cause non-physical behavior.
---@param body b2Body body
---@param position vector3 the world position of the body's local origin.
---@param angle number the world position of the body's local origin.
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_transform:body-position-angle)
function b2d.body.set_transform(body, position, angle) end

---Set the type of this body. This may alter the mass and velocity.
---@param body b2Body body
---@param type b2d.body.B2 the body type
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_type:body-type)
function b2d.body.set_type(body, type) end

---Set the user data. Use this to store your application specific data.
---@param body b2Body body
---@param id hash the game object id
---
---[Open in Browser](https://defold.com/ref/b2d.body-lua#b2d.body.set_user_data:body-id)
function b2d.body.set_user_data(body, id) end

---Destroying a chain removes all segment shapes owned by the chain. Destroying
---any segment shape through `b2d.body.destroy_shape` also destroys its parent chain.
---@param chain b2Chain chain
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.destroy:chain)
function b2d.chain.destroy(chain) end

---Returns `nil` if the shape is not a chain segment.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2Chain|nil chain parent chain, or `nil` if the shape is not a chain segment
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.from_shape:shape_id)
function b2d.chain.from_shape(shape_id) end

---Get chain friction.
---@param chain b2Chain chain
---@return number friction chain friction
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_friction:chain)
function b2d.chain.get_friction(chain) end

---Get the chain geometry.
---@param chain b2Chain chain
---@return b2d.chain_geometry geometry chain geometry
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_geometry:chain)
function b2d.chain.get_geometry(chain) end

---Get chain material id.
---@param chain b2Chain chain
---@return integer material chain material id
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_material:chain)
function b2d.chain.get_material(chain) end

---Get chain restitution.
---@param chain b2Chain chain
---@return number restitution chain restitution
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_restitution:chain)
function b2d.chain.get_restitution(chain) end

---Get the number of segment shapes in a chain.
---@param chain b2Chain chain
---@return integer count segment count
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_segment_count:chain)
function b2d.chain.get_segment_count(chain) end

---Get the segment shapes owned by a chain.
---@param chain b2Chain chain
---@return b2d.shape_info[] segments chain segment shapes
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_segments:chain)
function b2d.chain.get_segments(chain) end

---Get the world owning a chain.
---@param chain b2Chain chain
---@return b2World world owning world
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.get_world:chain)
function b2d.chain.get_world(chain) end

---Validate a chain handle.
---@param chain b2Chain chain
---@return boolean valid true if the chain handle still refers to a live Box2D chain
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.is_valid:chain)
function b2d.chain.is_valid(chain) end

---Set chain friction.
---@param chain b2Chain chain
---@param friction number chain friction
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.set_friction:chain-friction)
function b2d.chain.set_friction(chain, friction) end

---Set chain material id.
---@param chain b2Chain chain
---@param material integer chain material id
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.set_material:chain-material)
function b2d.chain.set_material(chain, material) end

---Set chain restitution.
---@param chain b2Chain chain
---@param restitution number chain restitution
---
---[Open in Browser](https://defold.com/ref/b2d.chain-lua#b2d.chain.set_restitution:chain-restitution)
function b2d.chain.set_restitution(chain, restitution) end

---Get fixture AABB for a child shape.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param child_index integer 1-based child shape index
---@return b2d.aabb aabb the fixture AABB
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_aabb:body-fixture_index-child_index)
function b2d.fixture.get_aabb(body, fixture_index, child_index) end

---Get fixture density.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return number density density in kg/m^2
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_density:body-fixture_index)
function b2d.fixture.get_density(body, fixture_index) end

---Get fixture filter data for a child shape.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param child_index integer 1-based child shape index
---@return b2d.filter filter the filter data
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_filter_data:body-fixture_index-child_index)
function b2d.fixture.get_filter_data(body, fixture_index, child_index) end

---Get fixture friction.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return number friction
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_friction:body-fixture_index)
function b2d.fixture.get_friction(body, fixture_index) end

---Get fixture restitution.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return number restitution
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_restitution:body-fixture_index)
function b2d.fixture.get_restitution(body, fixture_index) end

---Get the fixture shape as a functional shape table.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return b2d.shape.definition shape the shape definition, suitable for reuse in `b2d.body.create_fixture`
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_shape:body-fixture_index)
function b2d.fixture.get_shape(body, fixture_index) end

---Get the fixture type.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return b2d.shape.SHAPE_TYPE type
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.get_type:body-fixture_index)
function b2d.fixture.get_type(body, fixture_index) end

---Check if a fixture is a sensor.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@return boolean enabled
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.is_sensor:body-fixture_index)
function b2d.fixture.is_sensor(body, fixture_index) end

---Refilter a fixture.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param touch_proxies boolean if true, touch broad-phase proxies
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.refilter:body-fixture_index-touch_proxies)
function b2d.fixture.refilter(body, fixture_index, touch_proxies) end

---Set fixture density.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param density number density in kg/m^2
---@param update_mass boolean if true, reset body mass data after the change
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_density:body-fixture_index-density-update_mass)
function b2d.fixture.set_density(body, fixture_index, density, update_mass) end

---Set fixture filter data for a child shape.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param child_index integer 1-based child shape index
---@param filter b2d.filter the filter data
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_filter_data:body-fixture_index-child_index-filter)
function b2d.fixture.set_filter_data(body, fixture_index, child_index, filter) end

---Set fixture friction.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param friction number
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_friction:body-fixture_index-friction)
function b2d.fixture.set_friction(body, fixture_index, friction) end

---Set fixture restitution.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param restitution number
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_restitution:body-fixture_index-restitution)
function b2d.fixture.set_restitution(body, fixture_index, restitution) end

---Set sensor mode for a fixture.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param enabled boolean
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_sensor:body-fixture_index-enabled)
function b2d.fixture.set_sensor(body, fixture_index, enabled) end

---This updates the existing Box2D v2 shape using the same table format as
---`b2d.body.create_fixture` and `b2d.fixture.get_shape`.
---The shape type must match the current fixture shape type. Polygon updates must
---keep the same vertex count. Chain shape geometry cannot be updated in-place.
---The body mass is not updated unless `update_mass` is true.
---
---**Examples:**
---
---```lua
---local body = b2d.get_body("#collisionobject")
---
----- Move a circle shape relative to the body origin.
---local circle = b2d.fixture.get_shape(body, 1)
---circle.center = vmath.vector3(24, 0, 0)
---b2d.fixture.set_shape(body, 1, circle, true)
---
----- Replace an edge shape's local endpoints.
---b2d.fixture.set_shape(body, 2, {
---    type = b2d.shape.SHAPE_TYPE_EDGE,
---    v1 = vmath.vector3(-32, 0, 0),
---    v2 = vmath.vector3( 32, 0, 0),
---})
---
----- Update a box shape using the polygon box convenience format.
----- The existing polygon must already have four vertices.
---b2d.fixture.set_shape(body, 3, {
---    type = b2d.shape.SHAPE_TYPE_BOX,
---    hx = 16,
---    hy = 8,
---    center = vmath.vector3(0, 20, 0),
---    angle = math.rad(30),
---}, true)
---```
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param shape b2d.shape.definition the shape definition
---@param update_mass boolean if true, reset body mass data after the change
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.set_shape:body-fixture_index-shape-update_mass)
function b2d.fixture.set_shape(body, fixture_index, shape, update_mass) end

---Test a point against a fixture.
---@param body b2Body body
---@param fixture_index integer 1-based fixture index from `b2d.body.get_fixtures`
---@param point vector3 point in world coordinates
---@return boolean hit
---
---[Open in Browser](https://defold.com/ref/b2d.fixture-lua#b2d.fixture.test_point:body-fixture_index-point)
function b2d.fixture.test_point(body, fixture_index, point) end

---Get the Box2D body from a collision object
---@param url string|hash|url the url to the game object collision component
---@return b2Body|nil body the body if successful. Otherwise `nil`.
---
---[Open in Browser](https://defold.com/ref/b2d-lua#b2d.get_body:url)
function b2d.get_body(url) end

---Get the Box2D version information for the active backend.
---@return b2d.version_info info version information
---
---[Open in Browser](https://defold.com/ref/b2d-lua#b2d.get_version:)
function b2d.get_version() end

---Get the Box2D world from the current collection
---@return b2World|nil world the world if successful. Otherwise `nil`.
---
---[Open in Browser](https://defold.com/ref/b2d-lua#b2d.get_world:)
function b2d.get_world() end

---Create a distance joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.distance_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_distance:body_a-body_b-definition)
function b2d.joint.create_distance(body_a, body_b, definition) end

---Create a filter joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.filter_definition optional definition table
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_filter:body_a-body_b-definition)
function b2d.joint.create_filter(body_a, body_b, definition) end

---Create a friction joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.friction_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_friction:body_a-body_b-definition)
function b2d.joint.create_friction(body_a, body_b, definition) end

---Create a gear joint.
---@param joint1 b2Joint first revolute or prismatic joint
---@param joint2 b2Joint second revolute or prismatic joint
---@param definition? b2d.joint.gear_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_gear:joint1-joint2-definition)
function b2d.joint.create_gear(joint1, joint2, definition) end

---Create a motor joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.motor_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_motor:body_a-body_b-definition)
function b2d.joint.create_motor(body_a, body_b, definition) end

---Create a mouse joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.mouse_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_mouse:body_a-body_b-definition)
function b2d.joint.create_mouse(body_a, body_b, definition) end

---Create a prismatic joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.prismatic_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_prismatic:body_a-body_b-definition)
function b2d.joint.create_prismatic(body_a, body_b, definition) end

---Create a pulley joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.pulley_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_pulley:body_a-body_b-definition)
function b2d.joint.create_pulley(body_a, body_b, definition) end

---Create a revolute joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.revolute_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_revolute:body_a-body_b-definition)
function b2d.joint.create_revolute(body_a, body_b, definition) end

---Create a rope joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.rope_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_rope:body_a-body_b-definition)
function b2d.joint.create_rope(body_a, body_b, definition) end

---Create a weld joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.weld_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_weld:body_a-body_b-definition)
function b2d.joint.create_weld(body_a, body_b, definition) end

---Create a wheel joint.
---@param body_a b2Body first body
---@param body_b b2Body second body
---@param definition? b2d.joint.wheel_definition optional joint definition
---@return b2Joint joint created joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.create_wheel:body_a-body_b-definition)
function b2d.joint.create_wheel(body_a, body_b, definition) end

---Destroy a joint created by `b2d.joint`.
---@param joint b2Joint joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.destroy:joint)
function b2d.joint.destroy(joint) end

---Enable or disable joint limits.
---@param joint b2Joint prismatic or revolute joint
---@param enable boolean true to enable limits
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.enable_limit:joint-enable)
function b2d.joint.enable_limit(joint, enable) end

---Enable or disable the joint motor.
---@param joint b2Joint prismatic, revolute, or wheel joint
---@param enable boolean true to enable the motor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.enable_motor:joint-enable)
function b2d.joint.enable_motor(joint, enable) end

---Enable or disable joint spring behavior.
---@param joint b2Joint distance, prismatic, revolute, or wheel joint
---@param enable boolean true to enable the spring
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.enable_spring:joint-enable)
function b2d.joint.enable_spring(joint, enable) end

---Get the world anchor on body A.
---@param joint b2Joint joint
---@return vector3 anchor world anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_anchor_a:joint)
function b2d.joint.get_anchor_a(joint) end

---Get the world anchor on body B.
---@param joint b2Joint joint
---@return vector3 anchor world anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_anchor_b:joint)
function b2d.joint.get_anchor_b(joint) end

---Get weld joint angular damping ratio.
---@param joint b2Joint weld joint
---@return number ratio damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_angular_damping_ratio:joint)
function b2d.joint.get_angular_damping_ratio(joint) end

---Get weld joint angular frequency.
---@param joint b2Joint weld joint
---@return number hertz frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_angular_hertz:joint)
function b2d.joint.get_angular_hertz(joint) end

---Get motor joint angular offset.
---@param joint b2Joint motor joint
---@return number offset angular offset in radians
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_angular_offset:joint)
function b2d.joint.get_angular_offset(joint) end

---Get the first body connected to a joint.
---@param joint b2Joint joint
---@return b2Body body body A
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_body_a:joint)
function b2d.joint.get_body_a(joint) end

---Get the second body connected to a joint.
---@param joint b2Joint joint
---@return b2Body body body B
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_body_b:joint)
function b2d.joint.get_body_b(joint) end

---Get whether connected bodies can collide.
---@param joint b2Joint joint
---@return boolean collide true if connected bodies can collide
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_collide_connected:joint)
function b2d.joint.get_collide_connected(joint) end

---Get motor joint correction factor.
---@param joint b2Joint motor joint
---@return number factor correction factor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_correction_factor:joint)
function b2d.joint.get_correction_factor(joint) end

---Get the current distance joint length.
---@param joint b2Joint distance joint
---@return number length current length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_current_length:joint)
function b2d.joint.get_current_length(joint) end

---Get spring damping ratio.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@return number ratio damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_damping_ratio:joint)
function b2d.joint.get_damping_ratio(joint) end

---Get spring frequency.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@return number frequency frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_frequency:joint)
function b2d.joint.get_frequency(joint) end

---Get pulley ground anchor A.
---@param joint b2Joint pulley joint
---@return vector3 anchor world anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_ground_anchor_a:joint)
function b2d.joint.get_ground_anchor_a(joint) end

---Get pulley ground anchor B.
---@param joint b2Joint pulley joint
---@return vector3 anchor world anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_ground_anchor_b:joint)
function b2d.joint.get_ground_anchor_b(joint) end

---Alias for `b2d.joint.get_frequency`.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@return number hertz frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_hertz:joint)
function b2d.joint.get_hertz(joint) end

---Get the first joint connected to a gear joint.
---@param joint b2Joint gear joint
---@return b2Joint joint1 first connected joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_joint1:joint)
function b2d.joint.get_joint1(joint) end

---Get the second joint connected to a gear joint.
---@param joint b2Joint gear joint
---@return b2Joint joint2 second connected joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_joint2:joint)
function b2d.joint.get_joint2(joint) end

---Get revolute joint angle.
---@param joint b2Joint revolute joint
---@return number angle angle in radians
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_joint_angle:joint)
function b2d.joint.get_joint_angle(joint) end

---Get joint speed.
---@param joint b2Joint prismatic, revolute, or wheel joint
---@return number speed joint speed
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_joint_speed:joint)
function b2d.joint.get_joint_speed(joint) end

---Get joint translation.
---@param joint b2Joint prismatic or wheel joint
---@return number translation translation in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_joint_translation:joint)
function b2d.joint.get_joint_translation(joint) end

---Get the distance joint length.
---@param joint b2Joint distance joint
---@return number length length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_length:joint)
function b2d.joint.get_length(joint) end

---Get pulley segment length A.
---@param joint b2Joint pulley joint
---@return number length length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_length_a:joint)
function b2d.joint.get_length_a(joint) end

---Get pulley segment length B.
---@param joint b2Joint pulley joint
---@return number length length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_length_b:joint)
function b2d.joint.get_length_b(joint) end

---Get rope limit state.
---@param joint b2Joint rope joint
---@return b2d.joint.LIMIT_STATE state one of the `LIMIT_STATE_*` constants
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_limit_state:joint)
function b2d.joint.get_limit_state(joint) end

---Get weld joint linear damping ratio.
---@param joint b2Joint weld joint
---@return number ratio damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_linear_damping_ratio:joint)
function b2d.joint.get_linear_damping_ratio(joint) end

---Get weld joint linear frequency.
---@param joint b2Joint weld joint
---@return number hertz frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_linear_hertz:joint)
function b2d.joint.get_linear_hertz(joint) end

---Get motor joint linear offset.
---@param joint b2Joint motor joint
---@return vector3 offset linear offset in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_linear_offset:joint)
function b2d.joint.get_linear_offset(joint) end

---Get the local anchor on body A.
---@param joint b2Joint joint
---@return vector3 anchor local anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_local_anchor_a:joint)
function b2d.joint.get_local_anchor_a(joint) end

---Get the local anchor on body B.
---@param joint b2Joint joint
---@return vector3 anchor local anchor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_local_anchor_b:joint)
function b2d.joint.get_local_anchor_b(joint) end

---Get the local axis on body A.
---@param joint b2Joint prismatic or wheel joint
---@return vector3 axis local axis
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_local_axis_a:joint)
function b2d.joint.get_local_axis_a(joint) end

---Get the lower joint limit.
---@param joint b2Joint prismatic or revolute joint
---@return number lower lower limit
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_lower_limit:joint)
function b2d.joint.get_lower_limit(joint) end

---Get maximum force.
---@param joint b2Joint mouse or friction joint
---@return number force maximum force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_max_force:joint)
function b2d.joint.get_max_force(joint) end

---Get rope maximum length.
---@param joint b2Joint rope joint
---@return number length maximum length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_max_length:joint)
function b2d.joint.get_max_length(joint) end

---Get maximum motor force.
---@param joint b2Joint prismatic joint
---@return number force maximum motor force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_max_motor_force:joint)
function b2d.joint.get_max_motor_force(joint) end

---Get maximum motor torque.
---@param joint b2Joint revolute or wheel joint
---@return number torque maximum motor torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_max_motor_torque:joint)
function b2d.joint.get_max_motor_torque(joint) end

---Get maximum torque.
---@param joint b2Joint friction joint
---@return number torque maximum torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_max_torque:joint)
function b2d.joint.get_max_torque(joint) end

---Get the distance joint minimum length.
---@param joint b2Joint distance joint
---@return number length minimum length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_min_length:joint)
function b2d.joint.get_min_length(joint) end

---Get current motor force.
---@overload fun(joint:b2Joint):number
---@param joint b2Joint prismatic joint
---@param inv_dt number inverse time step
---@return number force motor force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_motor_force:joint-inv_dt)
function b2d.joint.get_motor_force(joint, inv_dt) end

---Get motor speed.
---@param joint b2Joint prismatic, revolute, or wheel joint
---@return number speed motor speed
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_motor_speed:joint)
function b2d.joint.get_motor_speed(joint) end

---Get current motor torque.
---@overload fun(joint:b2Joint):number
---@param joint b2Joint revolute or wheel joint
---@param inv_dt number inverse time step
---@return number torque motor torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_motor_torque:joint-inv_dt)
function b2d.joint.get_motor_torque(joint, inv_dt) end

---Get the target for a mouse joint.
---@param joint b2Joint mouse joint
---@return vector3 target world target
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_mouse_target:joint)
function b2d.joint.get_mouse_target(joint) end

---Get joint ratio.
---@param joint b2Joint pulley or gear joint
---@return number ratio joint ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_ratio:joint)
function b2d.joint.get_ratio(joint) end

---Get reaction force.
---@overload fun(joint:b2Joint):vector3
---@param joint b2Joint joint
---@param inv_dt number inverse time step
---@return vector3 force reaction force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_reaction_force:joint-inv_dt)
function b2d.joint.get_reaction_force(joint, inv_dt) end

---Get reaction torque.
---@overload fun(joint:b2Joint):number
---@param joint b2Joint joint
---@param inv_dt number inverse time step
---@return number torque reaction torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_reaction_torque:joint-inv_dt)
function b2d.joint.get_reaction_torque(joint, inv_dt) end

---Get the reference angle.
---@param joint b2Joint prismatic, revolute, or weld joint
---@return number angle reference angle in radians
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_reference_angle:joint)
function b2d.joint.get_reference_angle(joint) end

---Alias for `b2d.joint.get_damping_ratio`.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@return number ratio damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_spring_damping_ratio:joint)
function b2d.joint.get_spring_damping_ratio(joint) end

---Get spring frequency.
---@param joint b2Joint distance, mouse, prismatic, revolute, or wheel joint
---@return number hertz frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_spring_hertz:joint)
function b2d.joint.get_spring_hertz(joint) end

---Get the joint type.
---@param joint b2Joint joint
---@return b2d.joint.JOINT_TYPE type one of the `JOINT_TYPE_*` constants
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_type:joint)
function b2d.joint.get_type(joint) end

---Get the upper joint limit.
---@param joint b2Joint prismatic or revolute joint
---@return number upper upper limit
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_upper_limit:joint)
function b2d.joint.get_upper_limit(joint) end

---Get the world owning a joint.
---@param joint b2Joint joint
---@return b2World world owning world
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.get_world:joint)
function b2d.joint.get_world(joint) end

---Get whether the joint is active.
---@param joint b2Joint joint
---@return boolean active true if the joint is active
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.is_active:joint)
function b2d.joint.is_active(joint) end

---Get whether joint limits are enabled.
---@param joint b2Joint prismatic or revolute joint
---@return boolean enabled true if limits are enabled
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.is_limit_enabled:joint)
function b2d.joint.is_limit_enabled(joint) end

---Get whether the joint motor is enabled.
---@param joint b2Joint prismatic, revolute, or wheel joint
---@return boolean enabled true if the motor is enabled
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.is_motor_enabled:joint)
function b2d.joint.is_motor_enabled(joint) end

---Get whether joint spring behavior is enabled.
---@param joint b2Joint distance, prismatic, revolute, or wheel joint
---@return boolean enabled true if the spring is enabled
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.is_spring_enabled:joint)
function b2d.joint.is_spring_enabled(joint) end

---Validate a joint handle.
---@param joint b2Joint joint
---@return boolean valid true if the joint handle still refers to a live Box2D joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.is_valid:joint)
function b2d.joint.is_valid(joint) end

---Set weld joint angular damping ratio.
---@param joint b2Joint weld joint
---@param ratio number damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_angular_damping_ratio:joint-ratio)
function b2d.joint.set_angular_damping_ratio(joint, ratio) end

---Set weld joint angular frequency.
---@param joint b2Joint weld joint
---@param hertz number frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_angular_hertz:joint-hertz)
function b2d.joint.set_angular_hertz(joint, hertz) end

---Set motor joint angular offset.
---@param joint b2Joint motor joint
---@param offset number angular offset in radians
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_angular_offset:joint-offset)
function b2d.joint.set_angular_offset(joint, offset) end

---Set whether connected bodies can collide.
---@param joint b2Joint joint
---@param collide boolean true if connected bodies can collide
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_collide_connected:joint-collide)
function b2d.joint.set_collide_connected(joint, collide) end

---Set motor joint correction factor.
---@param joint b2Joint motor joint
---@param factor number correction factor
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_correction_factor:joint-factor)
function b2d.joint.set_correction_factor(joint, factor) end

---Set spring damping ratio.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@param ratio number damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_damping_ratio:joint-ratio)
function b2d.joint.set_damping_ratio(joint, ratio) end

---Set spring frequency.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@param frequency number frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_frequency:joint-frequency)
function b2d.joint.set_frequency(joint, frequency) end

---Alias for `b2d.joint.set_frequency`.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@param hertz number frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_hertz:joint-hertz)
function b2d.joint.set_hertz(joint, hertz) end

---Set the distance joint length.
---@param joint b2Joint distance joint
---@param length number length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_length:joint-length)
function b2d.joint.set_length(joint, length) end

---Set the distance joint length range.
---@param joint b2Joint distance joint
---@param min_length number minimum length in project units
---@param max_length number maximum length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_length_range:joint-min_length-max_length)
function b2d.joint.set_length_range(joint, min_length, max_length) end

---Set joint limits.
---@param joint b2Joint prismatic or revolute joint
---@param lower number lower limit
---@param upper number upper limit
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_limits:joint-lower-upper)
function b2d.joint.set_limits(joint, lower, upper) end

---Set weld joint linear damping ratio.
---@param joint b2Joint weld joint
---@param ratio number damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_linear_damping_ratio:joint-ratio)
function b2d.joint.set_linear_damping_ratio(joint, ratio) end

---Set weld joint linear frequency.
---@param joint b2Joint weld joint
---@param hertz number frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_linear_hertz:joint-hertz)
function b2d.joint.set_linear_hertz(joint, hertz) end

---Set motor joint linear offset.
---@param joint b2Joint motor joint
---@param offset vector3 linear offset in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_linear_offset:joint-offset)
function b2d.joint.set_linear_offset(joint, offset) end

---Set maximum force.
---@param joint b2Joint mouse or friction joint
---@param force number maximum force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_max_force:joint-force)
function b2d.joint.set_max_force(joint, force) end

---Set rope maximum length.
---@param joint b2Joint rope joint
---@param length number maximum length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_max_length:joint-length)
function b2d.joint.set_max_length(joint, length) end

---Set maximum motor force.
---@param joint b2Joint prismatic joint
---@param force number maximum motor force
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_max_motor_force:joint-force)
function b2d.joint.set_max_motor_force(joint, force) end

---Set maximum motor torque.
---@param joint b2Joint revolute or wheel joint
---@param torque number maximum motor torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_max_motor_torque:joint-torque)
function b2d.joint.set_max_motor_torque(joint, torque) end

---Set maximum torque.
---@param joint b2Joint friction joint
---@param torque number maximum torque
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_max_torque:joint-torque)
function b2d.joint.set_max_torque(joint, torque) end

---Set the distance joint minimum length.
---@param joint b2Joint distance joint
---@param length number minimum length in project units
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_min_length:joint-length)
function b2d.joint.set_min_length(joint, length) end

---Set motor speed.
---@param joint b2Joint prismatic, revolute, or wheel joint
---@param speed number motor speed
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_motor_speed:joint-speed)
function b2d.joint.set_motor_speed(joint, speed) end

---Set the target for a mouse joint.
---@param joint b2Joint mouse joint
---@param target vector3 world target
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_mouse_target:joint-target)
function b2d.joint.set_mouse_target(joint, target) end

---Set gear joint ratio.
---@param joint b2Joint gear joint
---@param ratio number gear ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_ratio:joint-ratio)
function b2d.joint.set_ratio(joint, ratio) end

---Set weld joint reference angle.
---@param joint b2Joint weld joint
---@param angle number reference angle in radians
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_reference_angle:joint-angle)
function b2d.joint.set_reference_angle(joint, angle) end

---Alias for `b2d.joint.set_damping_ratio`.
---@param joint b2Joint distance, mouse, weld, or wheel joint
---@param ratio number damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_spring_damping_ratio:joint-ratio)
function b2d.joint.set_spring_damping_ratio(joint, ratio) end

---Set spring frequency.
---@param joint b2Joint distance, mouse, prismatic, revolute, or wheel joint
---@param hertz number frequency in hertz
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.set_spring_hertz:joint-hertz)
function b2d.joint.set_spring_hertz(joint, hertz) end

---Wake the bodies connected to a joint.
---@param joint b2Joint joint
---
---[Open in Browser](https://defold.com/ref/b2d.joint-lua#b2d.joint.wake_bodies:joint)
function b2d.joint.wake_bodies(joint) end

---Check if contact events are enabled for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return boolean enabled true if contact events are enabled
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.are_contact_events_enabled:shape_id)
function b2d.shape.are_contact_events_enabled(shape_id) end

---Check if hit events are enabled for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return boolean enabled true if hit events are enabled
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.are_hit_events_enabled:shape_id)
function b2d.shape.are_hit_events_enabled(shape_id) end

---Check if pre-solve events are enabled for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return boolean enabled true if pre-solve events are enabled
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.are_pre_solve_events_enabled:shape_id)
function b2d.shape.are_pre_solve_events_enabled(shape_id) end

---Check if sensor events are enabled for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return boolean enabled true if sensor events are enabled
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.are_sensor_events_enabled:shape_id)
function b2d.shape.are_sensor_events_enabled(shape_id) end

---Enable or disable contact events for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param enable boolean true to enable contact events
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.enable_contact_events:shape_id-enable)
function b2d.shape.enable_contact_events(shape_id, enable) end

---Enable or disable hit events for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param enable boolean true to enable hit events
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.enable_hit_events:shape_id-enable)
function b2d.shape.enable_hit_events(shape_id, enable) end

---Enable or disable pre-solve events for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param enable boolean true to enable pre-solve events
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.enable_pre_solve_events:shape_id-enable)
function b2d.shape.enable_pre_solve_events(shape_id, enable) end

---Enable or disable sensor events for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param enable boolean true to enable sensor events
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.enable_sensor_events:shape_id-enable)
function b2d.shape.enable_sensor_events(shape_id, enable) end

---Get the body owning a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2Body body owning body
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_body:shape_id)
function b2d.shape.get_body(shape_id) end

---Get the closest point on a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param target vector3 world target point
---@return vector3 point closest world point on the shape
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_closest_point:shape_id-target)
function b2d.shape.get_closest_point(shape_id, target) end

---Get shape contact capacity.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return integer capacity maximum contact data count
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_contact_capacity:shape_id)
function b2d.shape.get_contact_capacity(shape_id) end

---Get touching contact data for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2d.contact_data[] contacts touching contacts
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_contact_data:shape_id)
function b2d.shape.get_contact_data(shape_id) end

---Get mass data for a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2d.mass_data data shape mass data
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_mass_data:shape_id)
function b2d.shape.get_mass_data(shape_id) end

---Get shape material id.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return integer material shape material id
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_material:shape_id)
function b2d.shape.get_material(shape_id) end

---Get sensor overlap capacity.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return integer capacity maximum sensor overlap count
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_sensor_capacity:shape_id)
function b2d.shape.get_sensor_capacity(shape_id) end

---Get sensor overlaps.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2d.shape_info[] overlaps overlapping shapes
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_sensor_overlaps:shape_id)
function b2d.shape.get_sensor_overlaps(shape_id) end

---Get a shape's geometry.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2d.shape.definition shape shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_shape:shape_id)
function b2d.shape.get_shape(shape_id) end

---Get the world owning a shape.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return b2World world owning world
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.get_world:shape_id)
function b2d.shape.get_world(shape_id) end

---Validate a shape handle.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@return boolean valid true if the shape handle still refers to a live Box2D shape
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.is_valid:shape_id)
function b2d.shape.is_valid(shape_id) end

---Ray cast a shape directly.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param origin vector3 world ray origin
---@param translation vector3 world ray translation
---@param max_fraction? number optional maximum translation fraction, defaults to 1
---@return b2d.shape_cast_output|nil hit cast result, or `nil`
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.ray_cast:shape_id-origin-translation-max_fraction)
function b2d.shape.ray_cast(shape_id, origin, translation, max_fraction) end

---Set shape material id.
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param material integer shape material id
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.set_material:shape_id-material)
function b2d.shape.set_material(shape_id, material) end

---This updates the shape geometry using the same table format as
---`b2d.body.create_shape` and `b2d.shape.get_shape`. The body mass is not
---updated unless `update_mass` is true.
---
---**Examples:**
---
---```lua
---local body = b2d.get_body("#collisionobject")
---
----- Move a circle shape relative to the body origin.
---local circle = b2d.shape.get_shape(body, 1)
---circle.center = vmath.vector3(24, 0, 0)
---b2d.shape.set_shape(body, 1, circle, true)
---
----- Replace a segment shape's local endpoints.
---b2d.shape.set_shape(body, 2, {
---    type = b2d.shape.SHAPE_TYPE_SEGMENT,
---    v1 = vmath.vector3(-32, 0, 0),
---    v2 = vmath.vector3( 32, 0, 0),
---})
---
----- Update a box shape using the polygon box convenience format.
---b2d.shape.set_shape(body, 3, {
---    type = b2d.shape.SHAPE_TYPE_BOX,
---    hx = 16,
---    hy = 8,
---    center = vmath.vector3(0, 20, 0),
---    angle = math.rad(30),
---}, true)
---```
---@param shape_id b2Shape shape handle from a shape info table, or pass `body, shape_index`
---@param definition b2d.shape.definition shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`
---@param update_mass boolean true to reset body mass from shapes
---
---[Open in Browser](https://defold.com/ref/b2d.shape-lua#b2d.shape.set_shape:shape_id-definition-update_mass)
function b2d.shape.set_shape(shape_id, definition, update_mass) end

---The return value is the fraction of `translation` that can be traveled before collision,
---or 1 if there is no hit.
---@param world b2World world
---@param capsule b2d.mover_capsule mover capsule
---@param translation vector3 capsule displacement
---@param filter? b2d.query_filter optional query filter
---@return number fraction travel fraction before collision
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.cast_mover:world-capsule-translation-filter)
function b2d.world.cast_mover(world, capsule, translation, filter) end

---Cast a ray.
---@overload fun(world:b2World, origin:vector3, translation:vector3, filter?:b2d.query_filter, max_results?:integer):(b2d.shape_cast_hit[], b2d.tree_stats)
---@param world b2World world from `b2d.get_world` or `b2d.body.get_world`
---@param origin vector3 world ray origin
---@param translation vector3 world ray translation
---@param filter? b2d.query_filter optional query filter
---@param max_results? integer optional maximum result count
---@return b2d.fixture_cast_hit[] hits ray-cast hits
---@return b2d.tree_stats stats broad-phase query statistics
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.cast_ray:world-origin-translation-filter-max_results)
function b2d.world.cast_ray(world, origin, translation, filter, max_results) end

---Cast a ray and return the closest hit.
---@overload fun(world:b2World, origin:vector3, translation:vector3, filter?:b2d.query_filter):b2d.shape_cast_hit|nil
---@param world b2World world from `b2d.get_world` or `b2d.body.get_world`
---@param origin vector3 world ray origin
---@param translation vector3 world ray translation
---@param filter? b2d.query_filter optional query filter
---@return b2d.fixture_cast_hit|nil hit closest hit, or `nil`
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.cast_ray_closest:world-origin-translation-filter)
function b2d.world.cast_ray_closest(world, origin, translation, filter) end

---Uses Box2D v2 time-of-impact for fixture child shapes that support distance proxies.
---Grid fixture children are skipped.
---@overload fun(world:b2World, shape:b2d.shape.definition, translation:vector3, filter?:b2d.query_filter, max_results?:integer):(b2d.shape_cast_hit[], b2d.tree_stats)
---@param world b2World world from `b2d.get_world` or `b2d.body.get_world`
---@param shape b2d.shape.definition query shape
---@param translation vector3 world shape translation
---@param filter? b2d.query_filter optional query filter
---@param max_results? integer optional maximum result count
---@return b2d.fixture_cast_hit[] hits shape-cast hits
---@return b2d.tree_stats stats broad-phase query statistics
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.cast_shape:world-shape-translation-filter-max_results)
function b2d.world.cast_shape(world, shape, translation, filter, max_results) end

---Collide a mover capsule against the world.
---@param world b2World world
---@param capsule b2d.mover_capsule mover capsule
---@param filter? b2d.query_filter optional query filter
---@param max_results? integer optional maximum result count. Omit or pass 0 for unlimited results.
---@return b2d.mover_plane[] planes collision planes
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.collide_mover:world-capsule-filter-max_results)
function b2d.world.collide_mover(world, capsule, filter, max_results) end

---Enable or disable continuous collision.
---@param world b2World world
---@param enable boolean true to enable continuous collision
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.enable_continuous:world-enable)
function b2d.world.enable_continuous(world, enable) end

---Enable or disable world sleeping.
---@param world b2World world
---@param enable boolean true to allow sleeping
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.enable_sleeping:world-enable)
function b2d.world.enable_sleeping(world, enable) end

---Enable or disable speculative collision.
---@param world b2World world
---@param enable boolean true to enable speculative collision
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.enable_speculative:world-enable)
function b2d.world.enable_speculative(world, enable) end

---Enable or disable warm starting.
---@param world b2World world
---@param enable boolean true to enable warm starting
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.enable_warm_starting:world-enable)
function b2d.world.enable_warm_starting(world, enable) end

---Apply an explosion impulse.
---@param world b2World world
---@param definition b2d.explosion_definition explosion definition
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.explode:world-definition)
function b2d.world.explode(world, definition) end

---Get the number of awake bodies.
---@param world b2World world
---@return integer count awake body count
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_awake_body_count:world)
function b2d.world.get_awake_body_count(world) end

---Get world counters.
---@param world b2World world
---@return b2d.world_counters counters world counters
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_counters:world)
function b2d.world.get_counters(world) end

---Get world gravity.
---@param world b2World world
---@return vector3 gravity gravity vector
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_gravity:world)
function b2d.world.get_gravity(world) end

---Get the hit event threshold.
---@param world b2World world
---@return number threshold hit event threshold in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_hit_event_threshold:world)
function b2d.world.get_hit_event_threshold(world) end

---Get the maximum linear speed.
---@param world b2World world
---@return number speed maximum linear speed in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_maximum_linear_speed:world)
function b2d.world.get_maximum_linear_speed(world) end

---Get world profiling data.
---@param world b2World world
---@return b2d.world_profile profile world profiling data
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_profile:world)
function b2d.world.get_profile(world) end

---Get the restitution threshold.
---@param world b2World world
---@return number threshold restitution threshold in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.get_restitution_threshold:world)
function b2d.world.get_restitution_threshold(world) end

---Get whether continuous collision is enabled.
---@param world b2World world
---@return boolean enabled true if continuous collision is enabled
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.is_continuous_enabled:world)
function b2d.world.is_continuous_enabled(world) end

---The world is locked during callbacks and some simulation phases. Functions
---marked as locked during callbacks cannot be called while this returns true.
---@param world b2World world
---@return boolean locked true if the world is locked
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.is_locked:world)
function b2d.world.is_locked(world) end

---Get whether world sleeping is enabled.
---@param world b2World world
---@return boolean enabled true if sleeping is enabled
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.is_sleeping_enabled:world)
function b2d.world.is_sleeping_enabled(world) end

---Check whether a world handle is valid.
---@param world b2World world
---@return boolean valid true if the world handle is valid
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.is_valid:world)
function b2d.world.is_valid(world) end

---Get whether warm starting is enabled.
---@param world b2World world
---@return boolean enabled true if warm starting is enabled
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.is_warm_starting_enabled:world)
function b2d.world.is_warm_starting_enabled(world) end

---Overlap an AABB.
---@overload fun(world:b2World, aabb:b2d.aabb, filter?:b2d.query_filter, max_results?:integer):(b2d.shape_info[], b2d.tree_stats)
---@param world b2World world from `b2d.get_world` or `b2d.body.get_world`
---@param aabb b2d.aabb query bounds
---@param filter? b2d.query_filter optional query filter
---@param max_results? integer optional maximum result count
---@return b2d.fixture_info[] fixtures overlapping fixtures
---@return b2d.tree_stats stats broad-phase query statistics
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.overlap_aabb:world-aabb-filter-max_results)
function b2d.world.overlap_aabb(world, aabb, filter, max_results) end

---Overlap a shape.
---@overload fun(world:b2World, shape:b2d.shape.definition, filter?:b2d.query_filter, max_results?:integer):(b2d.shape_info[], b2d.tree_stats)
---@param world b2World world from `b2d.get_world` or `b2d.body.get_world`
---@param shape b2d.shape.definition query shape
---@param filter? b2d.query_filter optional query filter
---@param max_results? integer optional maximum result count
---@return b2d.fixture_info[] fixtures overlapping fixtures
---@return b2d.tree_stats stats broad-phase query statistics
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.overlap_shape:world-shape-filter-max_results)
function b2d.world.overlap_shape(world, shape, filter, max_results) end

---Rebuild the static broad-phase tree.
---@param world b2World world
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.rebuild_static_tree:world)
function b2d.world.rebuild_static_tree(world) end

---Set contact solver tuning.
---@param world b2World world
---@param hertz number contact stiffness frequency in hertz
---@param damping_ratio number contact damping ratio
---@param pushout number pushout velocity in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_contact_tuning:world-hertz-damping_ratio-pushout)
function b2d.world.set_contact_tuning(world, hertz, damping_ratio, pushout) end

---Set world gravity.
---@param world b2World world
---@param gravity vector3 gravity vector
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_gravity:world-gravity)
function b2d.world.set_gravity(world, gravity) end

---Set the hit event threshold.
---@param world b2World world
---@param threshold number hit event threshold in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_hit_event_threshold:world-threshold)
function b2d.world.set_hit_event_threshold(world, threshold) end

---Set joint solver tuning.
---@param world b2World world
---@param hertz number joint stiffness frequency in hertz
---@param damping_ratio number joint damping ratio
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_joint_tuning:world-hertz-damping_ratio)
function b2d.world.set_joint_tuning(world, hertz, damping_ratio) end

---Set the maximum linear speed.
---@param world b2World world
---@param speed number maximum linear speed in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_maximum_linear_speed:world-speed)
function b2d.world.set_maximum_linear_speed(world, speed) end

---Collisions below this relative speed use inelastic collision response.
---@param world b2World world
---@param threshold number restitution threshold in project units per second
---
---[Open in Browser](https://defold.com/ref/b2d.world-lua#b2d.world.set_restitution_threshold:world-threshold)
function b2d.world.set_restitution_threshold(world, threshold) end
