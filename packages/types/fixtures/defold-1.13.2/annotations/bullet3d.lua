--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.bullet3d
---Native-style access to the Bullet 3D world and collision objects owned by
---Defold. World creation, destruction and stepping remain controlled by Defold.
---The backend name refers to three-dimensional physics.
---
---World, collision-object and rigid-body userdata are borrowed handles to
---Defold-owned objects. Shape userdata are borrowed logical child-slot handles
---attached to a collision object. Constraint userdata identify auxiliary native
---objects owned by this Lua API; destroy them explicitly when no longer needed.
---They are also destroyed automatically when a required body or world is
---destroyed.
---
---A collision-object, rigid-body or shape handle becomes invalid when its
---collision object is deleted or reloaded. A world handle remains valid across
---collision-object reloads, but becomes invalid when its collection and physics
---world are destroyed. The corresponding `is_valid()` function is safe for
---checking a retained handle; every other operation rejects an invalid handle.
---@field collision_object defold_api.bullet3d.collision_object
---@field constraint defold_api.bullet3d.constraint
---@field rigid_body defold_api.bullet3d.rigid_body
---@field shape defold_api.bullet3d.shape
---@field world defold_api.bullet3d.world
bullet3d = {}

---@class defold_api.bullet3d.collision_object
---Active simulation state.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@field ACTIVE_TAG bullet3d.collision_object.ACTIVATION_STATE
---Character collision object flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_CHARACTER_OBJECT bullet3d.collision_object.COLLISION_FLAG
---Custom material callback flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_CUSTOM_MATERIAL_CALLBACK bullet3d.collision_object.COLLISION_FLAG
---Disable SPU collision processing flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_DISABLE_SPU_COLLISION_PROCESSING bullet3d.collision_object.COLLISION_FLAG
---Disable debug visualization flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_DISABLE_VISUALIZE_OBJECT bullet3d.collision_object.COLLISION_FLAG
---Zero-valued default dynamic-object flag. Compare the complete collision-flags value with this constant; do not pass it to `has_collision_flag`, since zero is not a bit that can be tested.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_DYNAMIC_OBJECT bullet3d.collision_object.COLLISION_FLAG
---Kinematic collision object flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_KINEMATIC_OBJECT bullet3d.collision_object.COLLISION_FLAG
---Disable contact response flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_NO_CONTACT_RESPONSE bullet3d.collision_object.COLLISION_FLAG
---Static collision object flag.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@field CF_STATIC_OBJECT bullet3d.collision_object.COLLISION_FLAG
---Generic collision object type.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@field CO_COLLISION_OBJECT bullet3d.collision_object.INTERNAL_TYPE
---Ghost collision object type.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@field CO_GHOST_OBJECT bullet3d.collision_object.INTERNAL_TYPE
---Height-field fluid collision object type.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@field CO_HF_FLUID bullet3d.collision_object.INTERNAL_TYPE
---Rigid body collision object type.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@field CO_RIGID_BODY bullet3d.collision_object.INTERNAL_TYPE
---Soft body collision object type.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@field CO_SOFT_BODY bullet3d.collision_object.INTERNAL_TYPE
---Disable automatic deactivation.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@field DISABLE_DEACTIVATION bullet3d.collision_object.ACTIVATION_STATE
---Disable simulation.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@field DISABLE_SIMULATION bullet3d.collision_object.ACTIVATION_STATE
---Sleeping simulation state.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@field ISLAND_SLEEPING bullet3d.collision_object.ACTIVATION_STATE
---Wants-deactivation simulation state.
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@field WANTS_DEACTIVATION bullet3d.collision_object.ACTIVATION_STATE
bullet3d.collision_object = {}

---@class defold_api.bullet3d.constraint
---Cone-twist constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_CONE_TWIST bullet3d.constraint.CONSTRAINT_TYPE
---Generic 6-DOF constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_GENERIC_6DOF bullet3d.constraint.CONSTRAINT_TYPE
---Generic spring 6-DOF constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_GENERIC_6DOF_SPRING bullet3d.constraint.CONSTRAINT_TYPE
---Hinge constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_HINGE bullet3d.constraint.CONSTRAINT_TYPE
---Hinge2 constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_HINGE2 bullet3d.constraint.CONSTRAINT_TYPE
---Point-to-point constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_POINT_TO_POINT bullet3d.constraint.CONSTRAINT_TYPE
---Slider constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_SLIDER bullet3d.constraint.CONSTRAINT_TYPE
---Universal constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@field CONSTRAINT_TYPE_UNIVERSAL bullet3d.constraint.CONSTRAINT_TYPE
bullet3d.constraint = {}

---@class defold_api.bullet3d.rigid_body
---Disable automatic world gravity. Set this bit before assigning custom body gravity that must survive later world-gravity changes or re-adding the body to a world.
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.FLAG)
---@field BT_DISABLE_WORLD_GRAVITY bullet3d.rigid_body.FLAG
---Enable explicit gyroscopic force integration.
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.FLAG)
---@field BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT bullet3d.rigid_body.FLAG
---Enable implicit body-space gyroscopic force integration. This flag is enabled by default for newly constructed rigid bodies.
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.FLAG)
---@field BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY bullet3d.rigid_body.FLAG
---Enable implicit world-space gyroscopic force integration.
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.FLAG)
---@field BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD bullet3d.rigid_body.FLAG
bullet3d.rigid_body = {}

---@class defold_api.bullet3d.shape
---Box shape type Value `1`. Shape data contains positive vector3 `dimensions` in Defold units.
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_BOX bullet3d.shape.SHAPE_TYPE
---Capsule shape type Value `2`. Shape data contains a positive numeric `diameter` and positive numeric cylindrical-section `height` in Defold units.
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_CAPSULE bullet3d.shape.SHAPE_TYPE
---Convex hull shape type Value `3`. Shape data contains a `vertices` array with at least four finite vector3 values in Defold units.
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_HULL bullet3d.shape.SHAPE_TYPE
---Triangle mesh shape type Value `4`. Shape data contains only the `type`; triangle geometry is read-only.
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_MESH bullet3d.shape.SHAPE_TYPE
---Sphere shape type Value `0`. Shape data contains a positive numeric `diameter` in Defold units.
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@field SHAPE_TYPE_SPHERE bullet3d.shape.SHAPE_TYPE
bullet3d.shape = {}

---@class defold_api.bullet3d.world
bullet3d.world = {}

---@enum defold_enum.bullet3d.collision_object.ACTIVATION_STATE: integer
local __defold_enum_bullet3d_collision_object_ACTIVATION_STATE = {
    ACTIVE_TAG = nil,
    ISLAND_SLEEPING = nil,
    WANTS_DEACTIVATION = nil,
    DISABLE_DEACTIVATION = nil,
    DISABLE_SIMULATION = nil,
}

---Collision object activation states
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.ACTIVATION_STATE)
---@alias bullet3d.collision_object.ACTIVATION_STATE defold_enum.bullet3d.collision_object.ACTIVATION_STATE
---| `bullet3d.collision_object.ACTIVE_TAG`
---| `bullet3d.collision_object.ISLAND_SLEEPING`
---| `bullet3d.collision_object.WANTS_DEACTIVATION`
---| `bullet3d.collision_object.DISABLE_DEACTIVATION`
---| `bullet3d.collision_object.DISABLE_SIMULATION`

---@enum defold_enum.bullet3d.collision_object.COLLISION_FLAG: integer
local __defold_enum_bullet3d_collision_object_COLLISION_FLAG = {
    CF_DYNAMIC_OBJECT = nil,
    CF_STATIC_OBJECT = nil,
    CF_KINEMATIC_OBJECT = nil,
    CF_NO_CONTACT_RESPONSE = nil,
    CF_CUSTOM_MATERIAL_CALLBACK = nil,
    CF_CHARACTER_OBJECT = nil,
    CF_DISABLE_VISUALIZE_OBJECT = nil,
    CF_DISABLE_SPU_COLLISION_PROCESSING = nil,
}

---Collision object flags
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.COLLISION_FLAG)
---@alias bullet3d.collision_object.COLLISION_FLAG defold_enum.bullet3d.collision_object.COLLISION_FLAG
---| `bullet3d.collision_object.CF_DYNAMIC_OBJECT`
---| `bullet3d.collision_object.CF_STATIC_OBJECT`
---| `bullet3d.collision_object.CF_KINEMATIC_OBJECT`
---| `bullet3d.collision_object.CF_NO_CONTACT_RESPONSE`
---| `bullet3d.collision_object.CF_CUSTOM_MATERIAL_CALLBACK`
---| `bullet3d.collision_object.CF_CHARACTER_OBJECT`
---| `bullet3d.collision_object.CF_DISABLE_VISUALIZE_OBJECT`
---| `bullet3d.collision_object.CF_DISABLE_SPU_COLLISION_PROCESSING`

---@enum defold_enum.bullet3d.collision_object.INTERNAL_TYPE: integer
local __defold_enum_bullet3d_collision_object_INTERNAL_TYPE = {
    CO_COLLISION_OBJECT = nil,
    CO_RIGID_BODY = nil,
    CO_GHOST_OBJECT = nil,
    CO_SOFT_BODY = nil,
    CO_HF_FLUID = nil,
}

---Native collision object types
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.INTERNAL_TYPE)
---@alias bullet3d.collision_object.INTERNAL_TYPE defold_enum.bullet3d.collision_object.INTERNAL_TYPE
---| `bullet3d.collision_object.CO_COLLISION_OBJECT`
---| `bullet3d.collision_object.CO_RIGID_BODY`
---| `bullet3d.collision_object.CO_GHOST_OBJECT`
---| `bullet3d.collision_object.CO_SOFT_BODY`
---| `bullet3d.collision_object.CO_HF_FLUID`

---@enum defold_enum.bullet3d.constraint.CONSTRAINT_TYPE: integer
local __defold_enum_bullet3d_constraint_CONSTRAINT_TYPE = {
    CONSTRAINT_TYPE_CONE_TWIST = nil,
    CONSTRAINT_TYPE_GENERIC_6DOF = nil,
    CONSTRAINT_TYPE_GENERIC_6DOF_SPRING = nil,
    CONSTRAINT_TYPE_HINGE = nil,
    CONSTRAINT_TYPE_HINGE2 = nil,
    CONSTRAINT_TYPE_POINT_TO_POINT = nil,
    CONSTRAINT_TYPE_SLIDER = nil,
    CONSTRAINT_TYPE_UNIVERSAL = nil,
}

---Constraint types
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.CONSTRAINT_TYPE)
---@alias bullet3d.constraint.CONSTRAINT_TYPE defold_enum.bullet3d.constraint.CONSTRAINT_TYPE
---| `bullet3d.constraint.CONSTRAINT_TYPE_CONE_TWIST`
---| `bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF`
---| `bullet3d.constraint.CONSTRAINT_TYPE_GENERIC_6DOF_SPRING`
---| `bullet3d.constraint.CONSTRAINT_TYPE_HINGE`
---| `bullet3d.constraint.CONSTRAINT_TYPE_HINGE2`
---| `bullet3d.constraint.CONSTRAINT_TYPE_POINT_TO_POINT`
---| `bullet3d.constraint.CONSTRAINT_TYPE_SLIDER`
---| `bullet3d.constraint.CONSTRAINT_TYPE_UNIVERSAL`

---@enum defold_enum.bullet3d.rigid_body.FLAG: integer
local __defold_enum_bullet3d_rigid_body_FLAG = {
    BT_DISABLE_WORLD_GRAVITY = nil,
    BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT = nil,
    BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD = nil,
    BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY = nil,
}

---Combine these constants into the complete flag mask accepted by
---`bullet3d.rigid_body.set_flags()`.
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.FLAG)
---@alias bullet3d.rigid_body.FLAG defold_enum.bullet3d.rigid_body.FLAG
---| `bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY`
---| `bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_EXPLICIT`
---| `bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_WORLD`
---| `bullet3d.rigid_body.BT_ENABLE_GYROSCOPIC_FORCE_IMPLICIT_BODY`

---@enum defold_enum.bullet3d.shape.SHAPE_TYPE: integer
local __defold_enum_bullet3d_shape_SHAPE_TYPE = {
    SHAPE_TYPE_BOX = nil,
    SHAPE_TYPE_CAPSULE = nil,
    SHAPE_TYPE_HULL = nil,
    SHAPE_TYPE_MESH = nil,
    SHAPE_TYPE_SPHERE = nil,
}

---Collision shape types
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.SHAPE_TYPE)
---@alias bullet3d.shape.SHAPE_TYPE defold_enum.bullet3d.shape.SHAPE_TYPE
---| `bullet3d.shape.SHAPE_TYPE_BOX`
---| `bullet3d.shape.SHAPE_TYPE_CAPSULE`
---| `bullet3d.shape.SHAPE_TYPE_HULL`
---| `bullet3d.shape.SHAPE_TYPE_MESH`
---| `bullet3d.shape.SHAPE_TYPE_SPHERE`

---Activate a collision object
---@param object btCollisionObject collision object
---@param force? boolean force activation of a static or kinematic object; defaults to `false`
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.activate:object-force)
function bullet3d.collision_object.activate(object, force) end

---Force the activation state
---@param object btCollisionObject collision object
---@param state bullet3d.collision_object.ACTIVATION_STATE activation state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.force_activation_state:object-state)
function bullet3d.collision_object.force_activation_state(object, state) end

---Get the activation state
---@param object btCollisionObject collision object
---@return bullet3d.collision_object.ACTIVATION_STATE state activation state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_activation_state:object)
function bullet3d.collision_object.get_activation_state(object) end

---Get the CCD motion threshold
---@param object btCollisionObject collision object
---@return number threshold threshold in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_ccd_motion_threshold:object)
function bullet3d.collision_object.get_ccd_motion_threshold(object) end

---Get the CCD swept sphere radius
---@param object btCollisionObject collision object
---@return number radius radius in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_ccd_swept_sphere_radius:object)
function bullet3d.collision_object.get_ccd_swept_sphere_radius(object) end

---Returns the raw unsigned 16-bit filter group that Defold assigned to the
---object's Bullet broadphase proxy. Use this value as `category_bits` in a
---`bullet3d.world` query filter. Bullet applies reciprocal filtering: the
---query's `mask_bits` must include this group, and the query's `category_bits`
---must be included in the object's filter mask.
---@param object btCollisionObject collision object in a Bullet world
---@return integer group raw unsigned 16-bit collision filter group
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_collision_filter_group:object)
function bullet3d.collision_object.get_collision_filter_group(object) end

---Returns the raw unsigned 16-bit filter mask that Defold assigned to the
---object's Bullet broadphase proxy. Use this value as `mask_bits` in a
---`bullet3d.world` query filter. Bullet applies reciprocal filtering: the
---query's `category_bits` must be included in this mask, and the query's
---`mask_bits` must include the object's filter group.
---@param object btCollisionObject collision object in a Bullet world
---@return integer mask raw unsigned 16-bit collision filter mask
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_collision_filter_mask:object)
function bullet3d.collision_object.get_collision_filter_mask(object) end

---Get collision flags
---@param object btCollisionObject collision object
---@return integer flags bit field of `CF_*` constants
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_collision_flags:object)
function bullet3d.collision_object.get_collision_flags(object) end

---Get the contact processing threshold
---@param object btCollisionObject collision object
---@return number threshold threshold in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_contact_processing_threshold:object)
function bullet3d.collision_object.get_contact_processing_threshold(object) end

---Get deactivation time
---@param object btCollisionObject collision object
---@return number seconds deactivation time
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_deactivation_time:object)
function bullet3d.collision_object.get_deactivation_time(object) end

---Get friction
---@param object btCollisionObject collision object
---@return number friction friction coefficient
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_friction:object)
function bullet3d.collision_object.get_friction(object) end

---Get the Bullet collision object type
---@param object btCollisionObject collision object
---@return bullet3d.collision_object.INTERNAL_TYPE type native collision object type
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_internal_type:object)
function bullet3d.collision_object.get_internal_type(object) end

---Get the world position
---@param object btCollisionObject collision object
---@return vector3 position world position in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_position:object)
function bullet3d.collision_object.get_position(object) end

---Get restitution
---@param object btCollisionObject collision object
---@return number restitution restitution coefficient
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_restitution:object)
function bullet3d.collision_object.get_restitution(object) end

---Get the world rotation
---@param object btCollisionObject collision object
---@return quaternion rotation world rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_rotation:object)
function bullet3d.collision_object.get_rotation(object) end

---Get one attached shape by one-based index.
---@param object btCollisionObject collision object
---@param shape_index integer one-based shape index
---@return btCollisionShape shape borrowed logical shape handle
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.collision_object.get_shape:object-shape_index)
function bullet3d.collision_object.get_shape(object, shape_index) end

---Get the number of shapes attached to a collision object.
---@param object btCollisionObject collision object
---@return integer count shape count
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.collision_object.get_shape_count:object)
function bullet3d.collision_object.get_shape_count(object) end

---Get all attached shapes.
---
---**Examples:**
---
---Enumerate the logical shapes attached to a collision object:
---
---```lua
---function init(self)
---    local object = bullet3d.get_collision_object("#collisionobject")
---    for _, shape in ipairs(bullet3d.collision_object.get_shapes(object)) do
---        local index = bullet3d.shape.get_index(shape)
---        local data = bullet3d.shape.get_shape(shape)
---        print("shape", index, "type", data.type)
---    end
---end
---```
---@param object btCollisionObject collision object
---@return btCollisionShape[] shapes array of borrowed shape handles
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.collision_object.get_shapes:object)
function bullet3d.collision_object.get_shapes(object) end

---Get the world transform
---@param object btCollisionObject collision object
---@return vector3 position world position in Defold units
---@return quaternion rotation world rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.get_world_transform:object)
function bullet3d.collision_object.get_world_transform(object) end

---Test a collision flag
---@param object btCollisionObject collision object
---@param flag integer collision flag or mask
---@return boolean set `true` when all requested flag bits are set
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.has_collision_flag:object-flag)
function bullet3d.collision_object.has_collision_flag(object, flag) end

---Test whether the object responds to contacts
---@param object btCollisionObject collision object
---@return boolean result contact response state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.has_contact_response:object)
function bullet3d.collision_object.has_contact_response(object) end

---This exposes Bullet's native `btCollisionObject::isActive` result. It is
---`false` for `ISLAND_SLEEPING` and `DISABLE_SIMULATION`, and `true` for the
---other activation states available to Defold collision objects. It is
---unrelated to whether the Defold component is enabled.
---@param object btCollisionObject collision object
---@return boolean active active state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_active:object)
function bullet3d.collision_object.is_active(object) end

---Box2D-style name for the same simulation state returned by
---`bullet3d.collision_object.is_active`.
---@param object btCollisionObject collision object
---@return boolean awake `false` when sleeping or simulation is disabled
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_awake:object)
function bullet3d.collision_object.is_awake(object) end

---Test whether the object is a ghost trigger
---@param object btCollisionObject collision object
---@return boolean result ghost object state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_ghost_object:object)
function bullet3d.collision_object.is_ghost_object(object) end

---Test whether the object is kinematic
---@param object btCollisionObject collision object
---@return boolean kinematic kinematic state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_kinematic:object)
function bullet3d.collision_object.is_kinematic(object) end

---Test whether the object is a rigid body
---@param object btCollisionObject collision object
---@return boolean result rigid body state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_rigid_body:object)
function bullet3d.collision_object.is_rigid_body(object) end

---Test whether the object is static
---@param object btCollisionObject collision object
---@return boolean static static state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_static:object)
function bullet3d.collision_object.is_static(object) end

---Test whether the object is static or kinematic
---@param object btCollisionObject collision object
---@return boolean result static or kinematic state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_static_or_kinematic:object)
function bullet3d.collision_object.is_static_or_kinematic(object) end

---Test whether a collision object handle is valid
---@param object btCollisionObject collision object
---@return boolean valid `true` if the native object still exists
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.is_valid:object)
function bullet3d.collision_object.is_valid(object) end

---Set the activation state
---@param object btCollisionObject collision object
---@param state bullet3d.collision_object.ACTIVATION_STATE activation state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_activation_state:object-state)
function bullet3d.collision_object.set_activation_state(object, state) end

---Passing `true` calls Bullet's `activate()`. Passing `false` requests the
---native `ISLAND_SLEEPING` state. As in Bullet, static or kinematic objects are
---not activated without force, and protected `DISABLE_DEACTIVATION` or
---`DISABLE_SIMULATION` states are not replaced by a sleeping request.
---@param object btCollisionObject collision object
---@param awake boolean requested awake state
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_awake:object-awake)
function bullet3d.collision_object.set_awake(object, awake) end

---Set the CCD motion threshold
---
---**Examples:**
---
---Enable continuous collision detection for a small, fast-moving body:
---
---```lua
---function init(self)
---    local body = bullet3d.get_rigid_body("#collisionobject")
---    bullet3d.collision_object.set_ccd_swept_sphere_radius(body, 0.25)
---    bullet3d.collision_object.set_ccd_motion_threshold(body, 0.5)
---end
---```
---@param object btCollisionObject collision object
---@param threshold number finite non-negative threshold in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_ccd_motion_threshold:object-threshold)
function bullet3d.collision_object.set_ccd_motion_threshold(object, threshold) end

---Set the CCD swept sphere radius
---@param object btCollisionObject collision object
---@param radius number finite non-negative radius in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_ccd_swept_sphere_radius:object-radius)
function bullet3d.collision_object.set_ccd_swept_sphere_radius(object, radius) end

---Set the contact processing threshold
---@param object btCollisionObject collision object
---@param threshold number finite threshold in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_contact_processing_threshold:object-threshold)
function bullet3d.collision_object.set_contact_processing_threshold(object, threshold) end

---Set deactivation time
---@param object btCollisionObject collision object
---@param seconds number finite deactivation time
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_deactivation_time:object-seconds)
function bullet3d.collision_object.set_deactivation_time(object, seconds) end

---Set friction
---@param object btCollisionObject collision object
---@param friction number finite friction coefficient
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_friction:object-friction)
function bullet3d.collision_object.set_friction(object, friction) end

---The owning game object's position is updated as well.
---@param object btCollisionObject collision object
---@param position vector3 finite world position in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_position:object-position)
function bullet3d.collision_object.set_position(object, position) end

---Set restitution
---@param object btCollisionObject collision object
---@param restitution number finite restitution coefficient
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_restitution:object-restitution)
function bullet3d.collision_object.set_restitution(object, restitution) end

---The owning game object's rotation is updated as well.
---@param object btCollisionObject collision object
---@param rotation quaternion finite, non-zero world rotation; normalized by the binding
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_rotation:object-rotation)
function bullet3d.collision_object.set_rotation(object, rotation) end

---The owning game object's position and rotation are updated as well, so the
---transform persists when Defold synchronizes game objects into Bullet.
---
---**Examples:**
---
---Move a collision object while preserving its rotation:
---
---```lua
---function init(self)
---    local object = bullet3d.get_collision_object("#collisionobject")
---    local position, rotation = bullet3d.collision_object.get_world_transform(object)
---    bullet3d.collision_object.set_world_transform(
---        object,
---        position + vmath.vector3(0, 5, 0),
---        rotation)
---    bullet3d.collision_object.activate(object, true)
---end
---```
---@param object btCollisionObject collision object
---@param position vector3 finite world position in Defold units
---@param rotation quaternion finite, non-zero world rotation; normalized by the binding
---
---[Open in Browser](https://defold.com/ref/bullet3d.collision_object-lua#bullet3d.collision_object.set_world_transform:object-position-rotation)
function bullet3d.collision_object.set_world_transform(object, position, rotation) end

---The world is derived from `body_a`.
---@param body_a btRigidBody first body
---@param body_b btRigidBody|nil second body or world
---@param params bullet3d.constraint.cone_twist_params local frames and options
---@return btTypedConstraint constraint cone-twist constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_cone_twist:body_a-body_b-params)
function bullet3d.constraint.create_cone_twist(body_a, body_b, params) end

---The params table requires local frame A and, for a two-body constraint,
---local frame B. It optionally accepts `collide_connected`. The world is
---derived from `body_a`. The active 6-DOF solver ignores its legacy
---linear-reference-frame selector, so that field is rejected rather than
---silently accepted.
---@param body_a btRigidBody first body
---@param body_b btRigidBody|nil second body or world
---@param params bullet3d.constraint.generic_6dof_params local frames and options
---@return btTypedConstraint constraint generic 6-DOF constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_generic_6dof:body_a-body_b-params)
function bullet3d.constraint.create_generic_6dof(body_a, body_b, params) end

---Both bodies and both local frames are required. The params table optionally
---accepts `collide_connected`. The world is derived from `body_a`. The active
---spring 6-DOF solver ignores its legacy linear-reference-frame selector, so
---that field is rejected rather than silently accepted.
---
---**Examples:**
---
---Create a spring that moves along its first linear axis:
---
---```lua
---function init(self)
---    local body_a = bullet3d.get_rigid_body("/body_a#collisionobject")
---    local body_b = bullet3d.get_rigid_body("/body_b#collisionobject")
---    self.spring = bullet3d.constraint.create_generic_6dof_spring(body_a, body_b, {
---        frame_a_position = vmath.vector3(),
---        frame_a_rotation = vmath.quat(),
---        frame_b_position = vmath.vector3(),
---        frame_b_rotation = vmath.quat(),
---    })
---    bullet3d.constraint.set_limit(self.spring, 1, -1, 1)
---    bullet3d.constraint.enable_spring(self.spring, 1, true)
---    bullet3d.constraint.set_spring_stiffness(self.spring, 1, 20)
---    bullet3d.constraint.set_spring_damping(self.spring, 1, 0.5)
---    bullet3d.constraint.set_spring_equilibrium_point(self.spring, 1, 0)
---end
---
---function final(self)
---    if self.spring and bullet3d.constraint.is_valid(self.spring) then
---        bullet3d.constraint.destroy(self.spring)
---    end
---end
---```
---@param body_a btRigidBody first body
---@param body_b btRigidBody second body
---@param params bullet3d.constraint.generic_6dof_spring_params local frames and options
---@return btTypedConstraint constraint spring 6-DOF constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_generic_6dof_spring:body_a-body_b-params)
function bullet3d.constraint.create_generic_6dof_spring(body_a, body_b, params) end

---The world is derived from `body_a`.
---
---**Examples:**
---
---Create a motorized hinge with a 90-degree range:
---
---```lua
---function init(self)
---    local body_a = bullet3d.get_rigid_body("/door#collisionobject")
---    local body_b = bullet3d.get_rigid_body("/frame#collisionobject")
---    self.hinge = bullet3d.constraint.create_hinge(body_a, body_b, {
---        frame_a_position = vmath.vector3(-0.5, 0, 0),
---        frame_a_rotation = vmath.quat(),
---        frame_b_position = vmath.vector3(0.5, 0, 0),
---        frame_b_rotation = vmath.quat(),
---    })
---    bullet3d.constraint.set_hinge_limits(self.hinge, -math.pi / 4, math.pi / 4)
---    bullet3d.constraint.set_hinge_motor(self.hinge, true, 1.5, 2.5)
---end
---
---function final(self)
---    if self.hinge and bullet3d.constraint.is_valid(self.hinge) then
---        bullet3d.constraint.destroy(self.hinge)
---    end
---end
---```
---@param body_a btRigidBody first body
---@param body_b btRigidBody|nil second body or world
---@param params bullet3d.constraint.hinge_params local frames and options
---@return btTypedConstraint constraint hinge constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_hinge:body_a-body_b-params)
function bullet3d.constraint.create_hinge(body_a, body_b, params) end

---Both bodies are required. Its initial linear suspension travel is one Defold
---unit in either direction. The world is derived from `body_a`.
---@param body_a btRigidBody first body
---@param body_b btRigidBody second body
---@param params bullet3d.constraint.anchor_axes_params anchor, axes, and options
---@return btTypedConstraint constraint hinge2 constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_hinge2:body_a-body_b-params)
function bullet3d.constraint.create_hinge2(body_a, body_b, params) end

---The world is derived from `body_a`; both bodies must belong to that same world.
---
---**Examples:**
---
---Join two bodies at matching local pivots and explicitly destroy the
---constraint when the script is finalized:
---
---```lua
---function init(self)
---    local body_a = bullet3d.get_rigid_body("/body_a#collisionobject")
---    local body_b = bullet3d.get_rigid_body("/body_b#collisionobject")
---    self.constraint = bullet3d.constraint.create_point_to_point(body_a, body_b, {
---        pivot_a = vmath.vector3(0.5, 0, 0),
---        pivot_b = vmath.vector3(-0.5, 0, 0),
---    })
---end
---
---function final(self)
---    if self.constraint and bullet3d.constraint.is_valid(self.constraint) then
---        bullet3d.constraint.destroy(self.constraint)
---    end
---end
---```
---@param body_a btRigidBody first body
---@param body_b btRigidBody|nil second body or world
---@param params bullet3d.constraint.point_to_point_params pivots and options
---@return btTypedConstraint constraint point-to-point constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_point_to_point:body_a-body_b-params)
function bullet3d.constraint.create_point_to_point(body_a, body_b, params) end

---The world is derived from `body_a`.
---@param body_a btRigidBody first body
---@param body_b btRigidBody|nil second body or world
---@param params bullet3d.constraint.slider_params local frames and options
---@return btTypedConstraint constraint slider constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_slider:body_a-body_b-params)
function bullet3d.constraint.create_slider(body_a, body_b, params) end

---Both bodies are required. The world is derived from `body_a`.
---@param body_a btRigidBody first body
---@param body_b btRigidBody second body
---@param params bullet3d.constraint.anchor_axes_params anchor, axes, and options
---@return btTypedConstraint constraint universal constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.create_universal:body_a-body_b-params)
function bullet3d.constraint.create_universal(body_a, body_b, params) end

---Destroy a constraint
---@param constraint btTypedConstraint constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.destroy:constraint)
function bullet3d.constraint.destroy(constraint) end

---Enable or disable the cone-twist motor
---@param constraint btTypedConstraint cone-twist constraint
---@param enabled boolean motor state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.enable_cone_twist_motor:constraint-enabled)
function bullet3d.constraint.enable_cone_twist_motor(constraint, enabled) end

---Enable or disable a spring axis
---@param constraint btTypedConstraint spring 6-DOF or hinge2 constraint
---@param axis integer one-based axis from 1 to 6
---@param enabled boolean spring state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.enable_spring:constraint-axis-enabled)
function bullet3d.constraint.enable_spring(constraint, axis, enabled) end

---Get a current 6-DOF angle
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based angular-axis index from 1 to 3
---@return number angle current angle in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_6dof_angle:constraint-axis)
function bullet3d.constraint.get_6dof_angle(constraint, axis) end

---Get a current 6-DOF angular axis
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based angular-axis index from 1 to 3
---@return vector3 direction world-space unit axis
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_6dof_axis:constraint-axis)
function bullet3d.constraint.get_6dof_axis(constraint, axis) end

---Axes 1-3 are linear and axes 4-6 are angular. Generic 6-DOF, generic spring
---6-DOF, and universal constraints support bounce only on angular axes; hinge2
---supports it on every axis. Linear target velocity uses Defold units per
---second and angular target velocity uses radians per second. `max_force` is a
---force for linear axes and a torque in Defold squared units for angular axes.
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based axis from 1 to 6
---@return boolean enabled motor state
---@return number target_velocity linear or angular target velocity
---@return number max_force maximum motor force for linear axes or torque for angular axes
---@return number bounce bounce from 0 to 1
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_6dof_motor:constraint-axis)
function bullet3d.constraint.get_6dof_motor(constraint, axis) end

---Get a current 6-DOF linear position
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based linear-axis index from 1 to 3
---@return number position relative position in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_6dof_position:constraint-axis)
function bullet3d.constraint.get_6dof_position(constraint, axis) end

---Get universal or hinge2 anchors
---@param constraint btTypedConstraint universal or hinge2 constraint
---@return vector3 anchor_a world-space anchor on body A
---@return vector3 anchor_b world-space anchor on body B
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_anchors:constraint)
function bullet3d.constraint.get_anchors(constraint) end

---Get universal or hinge2 angles
---@param constraint btTypedConstraint universal or hinge2 constraint
---@return number angle_1 first angle in radians
---@return number angle_2 second angle in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_angles:constraint)
function bullet3d.constraint.get_angles(constraint) end

---Get universal or hinge2 axes
---@param constraint btTypedConstraint universal or hinge2 constraint
---@return vector3 axis_1 first world-space unit axis
---@return vector3 axis_2 second world-space unit axis
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_axes:constraint)
function bullet3d.constraint.get_axes(constraint) end

---Get the first linked body
---@param constraint btTypedConstraint constraint
---@return btRigidBody body first body
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_body_a:constraint)
function bullet3d.constraint.get_body_a(constraint) end

---Get the second linked body
---@param constraint btTypedConstraint constraint
---@return btRigidBody|nil body second body, or nil for a world constraint
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_body_b:constraint)
function bullet3d.constraint.get_body_b(constraint) end

---Get whether connected bodies can collide
---@param constraint btTypedConstraint constraint
---@return boolean collide whether connected bodies can collide
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_collide_connected:constraint)
function bullet3d.constraint.get_collide_connected(constraint) end

---Get cone-twist angular spans
---@param constraint btTypedConstraint cone-twist constraint
---@return number swing_span_1 first swing span in radians
---@return number swing_span_2 second swing span in radians
---@return number twist_span twist span in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_cone_twist_limits:constraint)
function bullet3d.constraint.get_cone_twist_limits(constraint) end

---Supported constraint types are hinge, cone-twist, generic 6-DOF, generic
---spring 6-DOF, slider, universal, and hinge2. Point-to-point constraints use
---`get_pivots` instead.
---
---Returns position and rotation. For one-body generic 6-DOF and slider
---constraints this is the user-body frame, despite Bullet storing it as its
---native frame B.
---@param constraint btTypedConstraint framed constraint
---@return vector3 position local position
---@return quaternion rotation local rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_frame_a:constraint)
function bullet3d.constraint.get_frame_a(constraint) end

---Supports the same constraint types as `get_frame_a`. For a one-body
---constraint, this is the frame attached to the fixed world body.
---@param constraint btTypedConstraint framed constraint
---@return vector3 position local position or world frame position
---@return quaternion rotation local rotation or world frame rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_frame_b:constraint)
function bullet3d.constraint.get_frame_b(constraint) end

---Get the current hinge angle
---@param constraint btTypedConstraint hinge constraint
---@return number angle angle in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_hinge_angle:constraint)
function bullet3d.constraint.get_hinge_angle(constraint) end

---Get hinge angular limits
---@param constraint btTypedConstraint hinge constraint
---@return number lower lower angle in radians
---@return number upper upper angle in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_hinge_limits:constraint)
function bullet3d.constraint.get_hinge_limits(constraint) end

---Get hinge motor settings
---@param constraint btTypedConstraint hinge constraint
---@return boolean enabled motor state
---@return number target_velocity angular target velocity in radians per second
---@return number max_impulse maximum angular motor impulse in Defold squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_hinge_motor:constraint)
function bullet3d.constraint.get_hinge_motor(constraint) end

---Axes 1-3 return linear limits in Defold units. Axes 4-6 return angular
---limits in radians.
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based axis from 1 to 6
---@return number lower lower limit
---@return number upper upper limit
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_limit:constraint-axis)
function bullet3d.constraint.get_limit(constraint, axis) end

---Get point-to-point pivots
---@param constraint btTypedConstraint point-to-point constraint
---@return vector3 pivot_a local body-A pivot
---@return vector3 pivot_b local body-B pivot or world anchor
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_pivots:constraint)
function bullet3d.constraint.get_pivots(constraint) end

---Get slider limits
---@param constraint btTypedConstraint slider constraint
---@return number lower_linear lower linear limit in Defold units
---@return number upper_linear upper linear limit in Defold units
---@return number lower_angular lower angular limit in radians
---@return number upper_angular upper angular limit in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_slider_limits:constraint)
function bullet3d.constraint.get_slider_limits(constraint) end

---The linear motor uses Defold units per second and maximum force. The angular
---motor uses radians per second and maximum torque in Defold squared units.
---@param constraint btTypedConstraint slider constraint
---@param motor string `linear` or `angular`
---@return boolean enabled motor state
---@return number target_velocity linear or angular target velocity
---@return number max_force maximum linear force or angular torque
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_slider_motor:constraint-motor)
function bullet3d.constraint.get_slider_motor(constraint, motor) end

---Get the current slider position
---@param constraint btTypedConstraint slider constraint
---@return number position current linear position in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_slider_position:constraint)
function bullet3d.constraint.get_slider_position(constraint) end

---Get the current cone-twist twist angle
---@param constraint btTypedConstraint cone-twist constraint
---@return number angle twist angle in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_twist_angle:constraint)
function bullet3d.constraint.get_twist_angle(constraint) end

---Get the constraint type
---@param constraint btTypedConstraint constraint
---@return bullet3d.constraint.CONSTRAINT_TYPE type constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_type:constraint)
function bullet3d.constraint.get_type(constraint) end

---Returns a stable lowercase diagnostic name such as `"hinge"` or
---`"generic_6dof_spring"`.
---@param constraint btTypedConstraint constraint
---@return string name constraint type name
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_type_name:constraint)
function bullet3d.constraint.get_type_name(constraint) end

---Get the slider linear reference-frame choice
---@param constraint btTypedConstraint slider constraint
---@return boolean use_frame_a true when linear calculations reference frame A
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_use_linear_reference_frame_a:constraint)
function bullet3d.constraint.get_use_linear_reference_frame_a(constraint) end

---Get the owning world
---@param constraint btTypedConstraint constraint
---@return btDiscreteDynamicsWorld world owning world
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.get_world:constraint)
function bullet3d.constraint.get_world(constraint) end

---Test whether a constraint is active in its world
---@param constraint btTypedConstraint constraint
---@return boolean active false while a linked body is disabled
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.is_active:constraint)
function bullet3d.constraint.is_active(constraint) end

---Test angular-only mode
---@param constraint btTypedConstraint hinge or cone-twist constraint
---@return boolean angular_only angular-only state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.is_angular_only:constraint)
function bullet3d.constraint.is_angular_only(constraint) end

---Both a ranged and a locked axis are considered limited; a free axis is not.
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based axis from 1 to 6
---@return boolean limited limit state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.is_limited:constraint-axis)
function bullet3d.constraint.is_limited(constraint, axis) end

---Test whether a cone-twist is past its swing limit
---@param constraint btTypedConstraint cone-twist constraint
---@return boolean past_limit swing-limit state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.is_past_swing_limit:constraint)
function bullet3d.constraint.is_past_swing_limit(constraint) end

---Test whether a constraint handle is valid
---@param constraint btTypedConstraint constraint handle
---@return boolean valid true while the native constraint exists
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.is_valid:constraint)
function bullet3d.constraint.is_valid(constraint) end

---Linear and angular values use the units described by `get_6dof_motor`.
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based axis from 1 to 6
---@param enabled boolean motor state
---@param target_velocity number linear or angular target velocity
---@param max_force number non-negative maximum motor force for linear axes or torque for angular axes
---@param bounce? number|nil optional bounce from 0 to 1; defaults to `0`
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_6dof_motor:constraint-axis-enabled-target_velocity-max_force-bounce)
function bullet3d.constraint.set_6dof_motor(constraint, axis, enabled, target_velocity, max_force, bounce) end

---Set angular-only mode
---@param constraint btTypedConstraint hinge or cone-twist constraint
---@param angular_only boolean angular-only state
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_angular_only:constraint-angular_only)
function bullet3d.constraint.set_angular_only(constraint, angular_only) end

---Set cone-twist angular spans
---@param constraint btTypedConstraint cone-twist constraint
---@param swing_span_1 number non-negative first swing span in radians
---@param swing_span_2 number non-negative second swing span in radians
---@param twist_span number non-negative twist span in radians
---@param softness? number|nil optional softness from 0 to 1; defaults to `1`
---@param bias? number|nil optional bias from 0 to 1; defaults to `0.3`
---@param relaxation? number|nil optional relaxation from 0 to 1; defaults to `1`
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_cone_twist_limits:constraint-swing_span_1-swing_span_2-twist_span-softness-bias-relaxation)
function bullet3d.constraint.set_cone_twist_limits(constraint, swing_span_1, swing_span_2, twist_span, softness, bias, relaxation) end

---By default, `target` is the desired rotation of body A relative to body B.
---With `constraint_space` set, it is the desired rotation of frame A relative
---to frame B in constraint space.
---@param constraint btTypedConstraint cone-twist constraint
---@param target quaternion finite, non-zero target orientation; normalized by the binding
---@param constraint_space? boolean|nil optional target-is-in-constraint-space flag; defaults to `false`
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_cone_twist_motor_target:constraint-target-constraint_space)
function bullet3d.constraint.set_cone_twist_motor_target(constraint, target, constraint_space) end

---Frame mutation is supported for hinge, generic 6-DOF, generic spring 6-DOF,
---and slider constraints. Cone-twist, universal, and hinge2 frames are
---read-only through this API.
---@param constraint btTypedConstraint mutable framed constraint
---@param position vector3 finite local position
---@param rotation quaternion finite, non-zero local rotation; normalized by the binding
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_frame_a:constraint-position-rotation)
function bullet3d.constraint.set_frame_a(constraint, position, rotation) end

---Supports the same constraint types as `set_frame_a`. For a one-body
---constraint, this changes the frame attached to the fixed world body.
---@param constraint btTypedConstraint mutable framed constraint
---@param position vector3 finite local position or world frame position
---@param rotation quaternion finite, non-zero local or world frame rotation; normalized by the binding
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_frame_b:constraint-position-rotation)
function bullet3d.constraint.set_frame_b(constraint, position, rotation) end

---This function only supports hinges attached to the world. For a two-body
---hinge, change both local frames with `set_frame_a` and `set_frame_b`.
---@param constraint btTypedConstraint one-body hinge constraint
---@param axis vector3 non-zero axis in body-A space
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_hinge_axis:constraint-axis)
function bullet3d.constraint.set_hinge_axis(constraint, axis) end

---Set hinge angular limits
---@param constraint btTypedConstraint hinge constraint
---@param lower number lower angle in radians
---@param upper number upper angle in radians
---@param bias? number|nil optional limit bias from 0 to 1; defaults to `0.3`
---@param relaxation? number|nil optional relaxation from 0 to 1; defaults to `1`
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_hinge_limits:constraint-lower-upper-bias-relaxation)
function bullet3d.constraint.set_hinge_limits(constraint, lower, upper, bias, relaxation) end

---Set hinge motor settings
---@param constraint btTypedConstraint hinge constraint
---@param enabled boolean motor state
---@param target_velocity number angular target velocity in radians per second
---@param max_impulse number non-negative maximum angular motor impulse in Defold squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_hinge_motor:constraint-enabled-target_velocity-max_impulse)
function bullet3d.constraint.set_hinge_motor(constraint, enabled, target_velocity, max_impulse) end

---Set a hinge motor angle target
---@param constraint btTypedConstraint hinge constraint
---@param target_angle number target angle in radians
---@param time_step number positive step duration in seconds
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_hinge_motor_target:constraint-target_angle-time_step)
function bullet3d.constraint.set_hinge_motor_target(constraint, target_angle, time_step) end

---Axes 1-3 use Defold units and axes 4-6 use radians. A lower value less than
---the upper value creates a limited range, equal values lock the axis, and a
---lower value greater than the upper value makes the axis free.
---@param constraint btTypedConstraint 6-DOF-derived constraint
---@param axis integer one-based axis from 1 to 6
---@param lower number lower limit
---@param upper number upper limit
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_limit:constraint-axis-lower-upper)
function bullet3d.constraint.set_limit(constraint, axis, lower, upper) end

---Set point-to-point pivots
---@param constraint btTypedConstraint point-to-point constraint
---@param pivot_a vector3 local body-A pivot
---@param pivot_b vector3 local body-B pivot or world anchor
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_pivots:constraint-pivot_a-pivot_b)
function bullet3d.constraint.set_pivots(constraint, pivot_a, pivot_b) end

---Each lower/upper pair follows Bullet's limit convention: lower less than
---upper creates a limited range, equal values lock that axis, and lower greater
---than upper makes it free. Bullet normalizes the angular limits.
---@param constraint btTypedConstraint slider constraint
---@param lower_linear number lower linear limit in Defold units
---@param upper_linear number upper linear limit in Defold units
---@param lower_angular number lower angular limit in radians
---@param upper_angular number upper angular limit in radians
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_slider_limits:constraint-lower_linear-upper_linear-lower_angular-upper_angular)
function bullet3d.constraint.set_slider_limits(constraint, lower_linear, upper_linear, lower_angular, upper_angular) end

---Linear and angular values use the units described by `get_slider_motor`.
---@param constraint btTypedConstraint slider constraint
---@param motor string `linear` or `angular`
---@param enabled boolean motor state
---@param target_velocity number linear or angular target velocity
---@param max_force number non-negative maximum linear force or angular torque
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_slider_motor:constraint-motor-enabled-target_velocity-max_force)
function bullet3d.constraint.set_slider_motor(constraint, motor, enabled, target_velocity, max_force) end

---Generic spring 6-DOF constraints use a scale-independent damping factor from
---0 to 1, where 1 means no damping. Hinge2 constraints use a damping coefficient
---where 0 means no damping and any non-negative value is accepted. Hinge2
---angular damping is automatically converted using `physics.scale` squared.
---@param constraint btTypedConstraint spring 6-DOF or hinge2 constraint
---@param axis integer one-based axis from 1 to 6
---@param damping number damping value in the range required by the constraint type
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_spring_damping:constraint-axis-damping)
function bullet3d.constraint.set_spring_damping(constraint, axis, damping) end

---With no axis, captures all current transforms. With an axis and no value,
---captures that axis. Linear values use Defold units and angular values use
---radians.
---@param constraint btTypedConstraint spring 6-DOF or hinge2 constraint
---@param axis? integer|nil optional one-based axis from 1 to 6
---@param value? number|nil optional explicit equilibrium value
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_spring_equilibrium_point:constraint-axis-value)
function bullet3d.constraint.set_spring_equilibrium_point(constraint, axis, value) end

---Linear stiffness values are independent of `physics.scale`. Angular
---stiffness values are automatically converted using `physics.scale` squared.
---@param constraint btTypedConstraint spring 6-DOF or hinge2 constraint
---@param axis integer one-based axis from 1 to 6
---@param stiffness number non-negative stiffness
---
---[Open in Browser](https://defold.com/ref/bullet3d.constraint-lua#bullet3d.constraint.set_spring_stiffness:constraint-axis-stiffness)
function bullet3d.constraint.set_spring_stiffness(constraint, axis, stiffness) end

---This returns both rigid bodies and ghost trigger objects.
---This function raises an error unless the collection uses 3D physics.
---@param url string|hash|url collision object component URL
---@return btCollisionObject|nil object the collision object, or `nil`
---
---[Open in Browser](https://defold.com/ref/bullet3d-lua#bullet3d.get_collision_object:url)
function bullet3d.get_collision_object(url) end

---Trigger components are ghost objects, so this function returns `nil` for them.
---This function raises an error unless the collection uses 3D physics.
---
---**Examples:**
---
---```lua
---local world = bullet3d.get_world()
---local body = bullet3d.get_rigid_body("#collisionobject")
---if world and body and bullet3d.rigid_body.is_valid(body) then
---    bullet3d.rigid_body.apply_central_impulse(body, vmath.vector3(0, 10, 0))
---end
---
----- A trigger is a collision object, not a rigid body.
---local trigger = bullet3d.get_collision_object("#trigger")
---assert(trigger and bullet3d.get_rigid_body("#trigger") == nil)
---```
---@param url string|hash|url collision object component URL
---@return btRigidBody|nil body the rigid body handle, or `nil`
---
---[Open in Browser](https://defold.com/ref/bullet3d-lua#bullet3d.get_rigid_body:url)
function bullet3d.get_rigid_body(url) end

---Get the Bullet version
---@return bullet3d.version_info info version information
---
---[Open in Browser](https://defold.com/ref/bullet3d-lua#bullet3d.get_version:)
function bullet3d.get_version() end

---This function raises an error unless the collection uses 3D physics.
---@return btDiscreteDynamicsWorld|nil world the world, or `nil` if the collection has no physics world
---
---[Open in Browser](https://defold.com/ref/bullet3d-lua#bullet3d.get_world:)
function bullet3d.get_world() end

---Apply a force at the center of mass
---@param body btRigidBody rigid body
---@param force vector3 force in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_central_force:body-force)
function bullet3d.rigid_body.apply_central_force(body, force) end

---Apply an impulse at the center of mass
---@param body btRigidBody rigid body
---@param impulse vector3 impulse in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_central_impulse:body-impulse)
function bullet3d.rigid_body.apply_central_impulse(body, impulse) end

---This has the same point semantics as `b2d.body.apply_force`: `world_position`
---is the point where the force is applied. The binding converts it to the
---center-of-mass-relative offset expected by Bullet's `applyForce` method.
---
---**Examples:**
---
---Apply an upward force at the game object's current world position:
---
---```lua
---function init(self)
---    local body = bullet3d.get_rigid_body("#collisionobject")
---    local force = vmath.vector3(0, 100, 0)
---    bullet3d.rigid_body.apply_force(body, force, go.get_world_position())
---end
---```
---@param body btRigidBody rigid body
---@param force vector3 force in Defold units
---@param world_position vector3 application point in world space and Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_force:body-force-world_position)
function bullet3d.rigid_body.apply_force(body, force, world_position) end

---This exposes Bullet's `btRigidBody::applyForce` point convention directly.
---`relative_position` is an offset from the body's center of mass expressed in
---world axes, not a world position or body-local coordinate.
---@param body btRigidBody rigid body
---@param force vector3 force in Defold units
---@param relative_position vector3 center-of-mass-relative offset in world axes and Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_force_at_relative_position:body-force-relative_position)
function bullet3d.rigid_body.apply_force_at_relative_position(body, force, relative_position) end

---This exposes Bullet's `btRigidBody::applyImpulse` point convention directly.
---`relative_position` is an offset from the body's center of mass expressed in
---world axes, not a world position or body-local coordinate.
---@param body btRigidBody rigid body
---@param impulse vector3 impulse in Defold units
---@param relative_position vector3 center-of-mass-relative offset in world axes and Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_impulse:body-impulse-relative_position)
function bullet3d.rigid_body.apply_impulse(body, impulse, relative_position) end

---This has the same point semantics as `b2d.body.apply_linear_impulse`.
---`world_position` is converted to the center-of-mass-relative offset expected
---by Bullet's `applyImpulse` method.
---@param body btRigidBody rigid body
---@param impulse vector3 impulse in Defold units
---@param world_position vector3 application point in world space and Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_linear_impulse:body-impulse-world_position)
function bullet3d.rigid_body.apply_linear_impulse(body, impulse, world_position) end

---Apply torque
---@param body btRigidBody rigid body
---@param torque vector3 torque in Defold squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_torque:body-torque)
function bullet3d.rigid_body.apply_torque(body, torque) end

---Apply a torque impulse
---@param body btRigidBody rigid body
---@param impulse vector3 angular impulse in Defold squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.apply_torque_impulse:body-impulse)
function bullet3d.rigid_body.apply_torque_impulse(body, impulse) end

---Clear accumulated force and torque
---@param body btRigidBody rigid body
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.clear_forces:body)
function bullet3d.rigid_body.clear_forces(body) end

---Calls Bullet's native `btRigidBody::getAabb`, which immediately calculates
---the bounds from the body's current collision shape and world transform. This
---does not read the broadphase proxy's cached AABB.
---@param body btRigidBody rigid body
---@return bullet3d.world.aabb aabb world-space bounds in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.compute_aabb:body)
function bullet3d.rigid_body.compute_aabb(body) end

---Get angular damping
---@param body btRigidBody rigid body
---@return number damping angular damping
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_angular_damping:body)
function bullet3d.rigid_body.get_angular_damping(body) end

---Get the angular factor
---@param body btRigidBody rigid body
---@return vector3 factor per-axis angular factor
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_angular_factor:body)
function bullet3d.rigid_body.get_angular_factor(body) end

---Get the angular sleeping threshold
---@param body btRigidBody rigid body
---@return number threshold threshold in radians per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_angular_sleeping_threshold:body)
function bullet3d.rigid_body.get_angular_sleeping_threshold(body) end

---Get angular velocity
---@param body btRigidBody rigid body
---@return vector3 velocity angular velocity in radians per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_angular_velocity:body)
function bullet3d.rigid_body.get_angular_velocity(body) end

---Get the center-of-mass world position
---@param body btRigidBody rigid body
---@return vector3 position center-of-mass position in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_center_of_mass_position:body)
function bullet3d.rigid_body.get_center_of_mass_position(body) end

---Get linear and angular damping
---@param body btRigidBody rigid body
---@return number linear linear damping
---@return number angular angular damping
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_damping:body)
function bullet3d.rigid_body.get_damping(body) end

---Get rigid body flags
---@param body btRigidBody rigid body
---@return integer flags rigid body flags
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_flags:body)
function bullet3d.rigid_body.get_flags(body) end

---Get body gravity
---@param body btRigidBody rigid body
---@return vector3 gravity gravity in Defold units per second squared
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_gravity:body)
function bullet3d.rigid_body.get_gravity(body) end

---Get inverse mass
---@param body btRigidBody rigid body
---@return number inverse_mass inverse mass
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_inverse_mass:body)
function bullet3d.rigid_body.get_inverse_mass(body) end

---Get linear damping
---@param body btRigidBody rigid body
---@return number damping linear damping
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_damping:body)
function bullet3d.rigid_body.get_linear_damping(body) end

---Get the linear factor
---@param body btRigidBody rigid body
---@return vector3 factor per-axis linear factor
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_factor:body)
function bullet3d.rigid_body.get_linear_factor(body) end

---Get the linear sleeping threshold
---@param body btRigidBody rigid body
---@return number threshold threshold in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_sleeping_threshold:body)
function bullet3d.rigid_body.get_linear_sleeping_threshold(body) end

---Get linear velocity
---@param body btRigidBody rigid body
---@return vector3 velocity velocity in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_velocity:body)
function bullet3d.rigid_body.get_linear_velocity(body) end

---This has the same point semantics as
---`b2d.body.get_linear_velocity_from_local_point`. The local origin is the
---body's center of mass.
---@param body btRigidBody rigid body
---@param local_point vector3 point in body-local space and Defold units
---@return vector3 velocity point velocity in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_velocity_from_local_point:body-local_point)
function bullet3d.rigid_body.get_linear_velocity_from_local_point(body, local_point) end

---This has the same point semantics as
---`b2d.body.get_linear_velocity_from_world_point`.
---@param body btRigidBody rigid body
---@param world_point vector3 point in world space and Defold units
---@return vector3 velocity point velocity in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_linear_velocity_from_world_point:body-world_point)
function bullet3d.rigid_body.get_linear_velocity_from_world_point(body, world_point) end

---Returns the diagonal local inertia in Defold mass-times-distance-squared
---units. A zero component denotes an axis with zero inverse inertia.
---@param body btRigidBody rigid body
---@return vector3 inertia diagonal local inertia
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_local_inertia:body)
function bullet3d.rigid_body.get_local_inertia(body) end

---Get mass
---@param body btRigidBody rigid body
---@return number mass mass, or zero for an infinite-mass body
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_mass:body)
function bullet3d.rigid_body.get_mass(body) end

---Get total accumulated force
---@param body btRigidBody rigid body
---@return vector3 force accumulated force in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_total_force:body)
function bullet3d.rigid_body.get_total_force(body) end

---Get total accumulated torque
---@param body btRigidBody rigid body
---@return vector3 torque accumulated torque in Defold squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_total_torque:body)
function bullet3d.rigid_body.get_total_torque(body) end

---The relative position is expressed in world axes. Despite Bullet's function
---name, it is not a body-local coordinate.
---@param body btRigidBody rigid body
---@param relative_position vector3 center-of-mass-relative offset in world axes and Defold units
---@return vector3 velocity point velocity in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_velocity_in_local_point:body-relative_position)
function bullet3d.rigid_body.get_velocity_in_local_point(body, relative_position) end

---Get the body's world
---@param body btRigidBody rigid body
---@return btDiscreteDynamicsWorld world owning world
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.get_world:body)
function bullet3d.rigid_body.get_world(body) end

---Test a rigid body flag
---@param body btRigidBody rigid body
---@param flag integer flag or mask
---@return boolean set `true` when all requested flag bits are set
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.has_flag:body-flag)
function bullet3d.rigid_body.has_flag(body, flag) end

---Test whether a handle refers to a valid rigid body
---@param body btRigidBody rigid body
---@return boolean valid rigid body validity
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.is_valid:body)
function bullet3d.rigid_body.is_valid(body) end

---Set angular damping
---@param body btRigidBody rigid body
---@param damping number finite angular damping in `[0, 1]`
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_angular_damping:body-damping)
function bullet3d.rigid_body.set_angular_damping(body, damping) end

---Set the angular factor
---@param body btRigidBody rigid body
---@param factor vector3 per-axis angular factor
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_angular_factor:body-factor)
function bullet3d.rigid_body.set_angular_factor(body, factor) end

---Set angular velocity
---@param body btRigidBody rigid body
---@param velocity vector3 finite angular velocity in radians per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_angular_velocity:body-velocity)
function bullet3d.rigid_body.set_angular_velocity(body, velocity) end

---Set linear and angular damping
---@param body btRigidBody rigid body
---@param linear number finite linear damping in `[0, 1]`
---@param angular number finite angular damping in `[0, 1]`
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_damping:body-linear-angular)
function bullet3d.rigid_body.set_damping(body, linear, angular) end

---This replaces the complete flag mask. Every enabled gyroscopic mode is
---evaluated independently, so clear existing gyroscopic mode bits before
---selecting a different mode.
---@param body btRigidBody rigid body
---@param flags integer rigid body flags
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_flags:body-flags)
function bullet3d.rigid_body.set_flags(body, flags) end

---A later `bullet3d.world.set_gravity()` call, or removing and re-adding the
---body to a world, can overwrite custom body gravity unless the body's
---`BT_DISABLE_WORLD_GRAVITY` flag is set.
---
---**Examples:**
---
---Give one body persistent custom gravity without discarding its other flags:
---
---```lua
---function init(self)
---    local body = bullet3d.get_rigid_body("#collisionobject")
---    local flags = bullet3d.rigid_body.get_flags(body)
---    flags = bit.bor(flags, bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY)
---    bullet3d.rigid_body.set_flags(body, flags)
---    bullet3d.rigid_body.set_gravity(body, vmath.vector3(0, 4, 0))
---end
---```
---@param body btRigidBody rigid body
---@param gravity vector3 gravity in Defold units per second squared
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_gravity:body-gravity)
function bullet3d.rigid_body.set_gravity(body, gravity) end

---Set linear damping
---@param body btRigidBody rigid body
---@param damping number finite linear damping in `[0, 1]`
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_linear_damping:body-damping)
function bullet3d.rigid_body.set_linear_damping(body, damping) end

---Set the linear factor
---@param body btRigidBody rigid body
---@param factor vector3 per-axis linear factor
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_linear_factor:body-factor)
function bullet3d.rigid_body.set_linear_factor(body, factor) end

---Set linear velocity
---@param body btRigidBody rigid body
---@param velocity vector3 finite velocity in Defold units per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_linear_velocity:body-velocity)
function bullet3d.rigid_body.set_linear_velocity(body, velocity) end

---Recalculates local inertia from the body's current collision shape. Only a
---dynamic body can be changed; zero mass cannot be used to convert it into a
---static body. Values too small to have a finite native inverse are rejected.
---The body is activated after the update.
---
---**Examples:**
---
---Change the mass of a dynamic collision object and inspect its recalculated inertia:
---
---```lua
---function init(self)
---    local body = bullet3d.get_rigid_body("#collisionobject")
---    bullet3d.rigid_body.set_mass(body, 5)
---    print("local inertia", bullet3d.rigid_body.get_local_inertia(body))
---end
---```
---@param body btRigidBody dynamic rigid body
---@param mass number finite mass greater than zero
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_mass:body-mass)
function bullet3d.rigid_body.set_mass(body, mass) end

---Sets mass and diagonal local inertia together, updates the world-space
---inertia tensor, and activates the body. Only dynamic bodies are accepted.
---A zero inertia component is allowed and disables angular response on that
---local axis; negative, non-finite, or nonzero values too small to have a
---finite native inverse are rejected.
---@param body btRigidBody dynamic rigid body
---@param mass number finite mass greater than zero
---@param local_inertia vector3 finite non-negative diagonal local inertia in Defold mass-times-distance-squared units
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_mass_properties:body-mass-local_inertia)
function bullet3d.rigid_body.set_mass_properties(body, mass, local_inertia) end

---Set the sleeping thresholds
---@param body btRigidBody rigid body
---@param linear number finite non-negative linear threshold in Defold units per second
---@param angular number finite non-negative angular threshold in radians per second
---
---[Open in Browser](https://defold.com/ref/bullet3d.rigid_body-lua#bullet3d.rigid_body.set_sleeping_thresholds:body-linear-angular)
function bullet3d.rigid_body.set_sleeping_thresholds(body, linear, angular) end

---Get the owning collision object.
---@param shape btCollisionShape shape handle
---@return btCollisionObject object owning collision object
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.get_collision_object:shape)
function bullet3d.shape.get_collision_object(shape) end

---Get the one-based child index.
---@param shape btCollisionShape shape handle
---@return integer shape_index one-based shape index
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.get_index:shape)
function bullet3d.shape.get_index(shape) end

---A non-compound collision object's only shape has no child transform, so this
---function returns the identity transform for it.
---@param shape btCollisionShape shape handle
---@return vector3 position local position
---@return quaternion rotation local rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.get_local_transform:shape)
function bullet3d.shape.get_local_transform(shape) end

---The returned table always contains `type`, one of `bullet3d.shape.SHAPE_TYPE_*`.
---A sphere also contains numeric `diameter`; a box contains vector3
---`dimensions`; a capsule contains numeric `diameter` and cylindrical-section
---`height`; a hull contains a `vertices` array of vector3 values; and a triangle
---mesh contains only `type`. Primitive and hull tables use Defold units and can
---be passed to a `bullet3d.world` shape query after adding the desired `position`
---and optional `rotation` fields.
---@param shape btCollisionShape shape handle
---@return bullet3d.shape.definition data typed shape geometry in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.get_shape:shape)
function bullet3d.shape.get_shape(shape) end

---Get the normalized Defold shape type.
---@param shape btCollisionShape shape handle
---@return bullet3d.shape.SHAPE_TYPE type collision shape type
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.get_type:shape)
function bullet3d.shape.get_type(shape) end

---Test whether a shape handle and its owner still exist.
---@param shape btCollisionShape shape handle
---@return boolean valid validity
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.is_valid:shape)
function bullet3d.shape.is_valid(shape) end

---A non-compound collision object's only shape has no child transform and is
---rejected. The binding normalizes the supplied rotation.
---@param shape btCollisionShape shape handle
---@param position vector3 finite local position
---@param rotation quaternion finite non-zero local rotation
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.set_local_transform:shape-position-rotation)
function bullet3d.shape.set_local_transform(shape, position, rotation) end

---The table uses the same format as `get_shape`. Its `type` must match the
---existing shape because changing native shape type is not supported. Primitive
---dimensions must be finite and greater than zero. Hulls require at least four
---finite vertices. Triangle mesh geometry cannot be changed with this function.
---
---**Examples:**
---
---Increase the dimensions of the first box shape by 50 percent for this instance:
---
---```lua
---function init(self)
---    local object = bullet3d.get_collision_object("#collisionobject")
---    local shape = bullet3d.collision_object.get_shape(object, 1)
---    local data = bullet3d.shape.get_shape(shape)
---
---    if data.type == bullet3d.shape.SHAPE_TYPE_BOX then
---        data.dimensions = data.dimensions * 1.5
---        bullet3d.shape.set_shape(shape, data)
---    end
---end
---```
---@param shape btCollisionShape shape handle
---@param data bullet3d.shape.definition typed shape geometry in Defold units
---
---[Open in Browser](https://defold.com/ref/bullet3d.shape-lua#bullet3d.shape.set_shape:shape-data)
function bullet3d.shape.set_shape(shape, data) end

---Casts immediately from `origin` to `origin + translation` and returns all
---matching hits sorted by fraction. Translation must be non-zero.
---Bullet's convex ray test normally does not report a ray whose start and end are both inside
---the same convex hull. Set `filter.report_initial_overlaps = true` to perform
---an exact point-overlap test at the origin and synthesize one deduplicated hit
---per initially touching or overlapping object with `fraction = 0`, zero `normal`,
---`point = origin`, `initial_overlap = true`, and `inside = true`. The point is
---the query origin, not a surface contact. This explicitly supports the
---inside-hull behavior requested by issue #5348. Fraction-zero native callbacks
---and starting overlaps are suppressed when the option is false.
---@param world btDiscreteDynamicsWorld world handle
---@param origin vector3 ray origin in world space
---@param translation vector3 non-zero ray displacement in world units
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum sorted hits, or zero for all
---@return bullet3d.world.cast_result[] hits cast results sorted by ascending fraction
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_ray:world-origin-translation-filter-max_results)
function bullet3d.world.cast_ray(world, origin, translation, filter, max_results) end

---Queues the same ray query as `bullet3d.world.cast_ray` and returns without
---executing it. After the next physics step, `callback(self, hits)` receives the
---cast-result array sorted by fraction. The query observes post-step world state.
---It is deferred on the main thread, not executed concurrently; use it to move
---work out of the current Lua call and to query the stepped state, not as a
---guarantee of lower total CPU time. Queued casts for the same world share one
---broadphase AABB refresh and all finish before their callbacks begin.
---
---**Examples:**
---
---Queue a downward cast and inspect only the closest non-trigger hit:
---
---```lua
---bullet3d.world.cast_ray_async(
---    bullet3d.get_world(),
---    go.get_world_position(),
---    vmath.vector3(0, -100, 0),
---    function(self, hits)
---        if hits[1] then
---            print("hit", hits[1].object)
---        end
---    end,
---    { include_triggers = false },
---    1)
---```
---@param world btDiscreteDynamicsWorld world handle
---@param origin vector3 ray origin in world space
---@param translation vector3 non-zero ray displacement in world units
---@param callback fun(self:script_instance, hits:bullet3d.world.cast_result[]) function called as `callback(self, hits)`
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum sorted hits, or zero for all
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_ray_async:world-origin-translation-callback-filter-max_results)
function bullet3d.world.cast_ray_async(world, origin, translation, callback, filter, max_results) end

---Equivalent to `bullet3d.world.cast_ray` with one result, but returns the
---hit table directly or `nil` on a miss.
---
---**Examples:**
---
---Cast downward and report the closest non-trigger hit:
---
---```lua
---function init(self)
---    local world = bullet3d.get_world()
---    local origin = go.get_world_position()
---    local translation = vmath.vector3(0, -100, 0)
---    local filter = { include_triggers = false }
---
---    local hit = bullet3d.world.cast_ray_closest(
---        world, origin, translation, filter)
---    if hit then
---        local distance = vmath.length(translation) * hit.fraction
---        print("hit", hit.object, "after", distance, "units")
---    end
---end
---```
---@param world btDiscreteDynamicsWorld world handle
---@param origin vector3 ray origin in world space
---@param translation vector3 non-zero ray displacement in world units
---@param filter? bullet3d.world.query_filter query filter
---@return bullet3d.world.cast_result|nil hit closest cast result, or `nil` on a miss
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_ray_closest:world-origin-translation-filter)
function bullet3d.world.cast_ray_closest(world, origin, translation, filter) end

---Sweeps the temporary shape from `shape.position` by `translation`, while
---interpolating from `shape.rotation` to `shape.target_rotation`. Translation
---must be non-zero. The query executes immediately and returns all matching hits
---sorted by fraction. Bullet's convex sweep supports only convex query shapes.
---
---When `filter.report_initial_overlaps` is true, an exact contact test at the
---starting transform synthesizes one deduplicated hit per overlapping object
---with `fraction = 0`, `point = shape.position`, zero `normal`,
---`initial_overlap = true`, and `inside = false`. The point is the query-shape
---origin, not a surface contact, and the result does not report penetration depth.
---@param world btDiscreteDynamicsWorld world handle
---@param shape bullet3d.shape.definition convex query shape with optional target rotation
---@param translation vector3 non-zero sweep displacement in world units
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum sorted hits, or zero for all
---@return bullet3d.world.cast_result[] hits cast results sorted by ascending fraction
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_shape:world-shape-translation-filter-max_results)
function bullet3d.world.cast_shape(world, shape, translation, filter, max_results) end

---Queues the same convex sweep as `bullet3d.world.cast_shape` and returns
---without executing it. After the next physics step, `callback(self, hits)`
---receives the sorted cast-result array from the post-step world state. The
---operation is deferred on the main thread rather than run concurrently. All
---queued casts for one world share one broadphase AABB refresh and all finish
---before their callbacks begin.
---@param world btDiscreteDynamicsWorld world handle
---@param shape bullet3d.shape.definition convex query shape with optional target rotation
---@param translation vector3 non-zero sweep displacement in world units
---@param callback fun(self:script_instance, hits:bullet3d.world.cast_result[]) function called as `callback(self, hits)`
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum sorted hits, or zero for all
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_shape_async:world-shape-translation-callback-filter-max_results)
function bullet3d.world.cast_shape_async(world, shape, translation, callback, filter, max_results) end

---Equivalent to `bullet3d.world.cast_shape` with one result, but returns
---the hit table directly or `nil` on a miss.
---@param world btDiscreteDynamicsWorld world handle
---@param shape bullet3d.shape.definition convex query shape with optional target rotation
---@param translation vector3 non-zero sweep displacement in world units
---@param filter? bullet3d.world.query_filter query filter
---@return bullet3d.world.cast_result|nil hit closest cast result, or `nil` on a miss
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.cast_shape_closest:world-shape-translation-filter)
function bullet3d.world.cast_shape_closest(world, shape, translation, filter) end

---Runs Bullet's discrete pair contact algorithm without changing the simulation.
---Both borrowed handles must belong to `world` and must identify different
---objects. The output preserves the caller's A/B order even when Bullet's
---internal manifold order is reversed. Collision filters are not applied to an
---explicitly selected pair.
---@param world btDiscreteDynamicsWorld world handle
---@param object_a btCollisionObject first collision object in the world
---@param object_b btCollisionObject different second collision object in the world
---@param max_results? integer maximum number of contact points, or zero for all
---@return bullet3d.world.contact_result[] contacts normalized contact results
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.contact_pair_test:world-object_a-object_b-max_results)
function bullet3d.world.contact_pair_test(world, object_a, object_b, max_results) end

---Runs Bullet's discrete contact test between `object` and matching objects in
---the same world. The supplied object is always `object_a` in returned contacts.
---The borrowed collision-object handle must belong to `world`. Bullet may return
---several contact points for one object pair and may include small positive
---contact-margin distances.
---
---**Examples:**
---
---Inspect current contacts for this collision object:
---
---```lua
---function update(self, dt)
---    local world = bullet3d.get_world()
---    local object = bullet3d.get_collision_object("#collisionobject")
---    local filter = { include_triggers = false }
---    local contacts = bullet3d.world.contact_test(world, object, filter)
---
---    for _, contact in ipairs(contacts) do
---        if contact.distance < 0 then
---            print("penetration", -contact.distance, "against", contact.object_b)
---        end
---    end
---end
---```
---@param world btDiscreteDynamicsWorld world handle
---@param object btCollisionObject collision object belonging to the world
---@param filter? bullet3d.world.query_filter filter applied to candidate `object_b` values
---@param max_results? integer maximum number of contact points, or zero for all
---@return bullet3d.world.contact_result[] contacts normalized contact results
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.contact_test:world-object-filter-max_results)
function bullet3d.world.contact_test(world, object, filter, max_results) end

---Get the number of collision objects in the world
---@param world btDiscreteDynamicsWorld world handle
---@return integer count number of collision objects
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.get_collision_object_count:world)
function bullet3d.world.get_collision_object_count(world) end

---Returns the Defold-owned collision objects currently registered in the world.
---Internal or unmanaged Bullet objects without Defold ownership metadata are
---not exposed.
---@param world btDiscreteDynamicsWorld world handle
---@param max_results? integer maximum number of results, or zero for all
---@return btCollisionObject[] objects array of collision-object handles
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.get_collision_objects:world-max_results)
function bullet3d.world.get_collision_objects(world, max_results) end

---Get world gravity
---@param world btDiscreteDynamicsWorld world handle
---@return vector3 gravity gravity in Defold units per second squared
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.get_gravity:world)
function bullet3d.world.get_gravity(world) end

---Test whether a world handle is valid
---@param world btDiscreteDynamicsWorld world handle
---@return boolean valid `true` if the native world still exists
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.is_valid:world)
function bullet3d.world.is_valid(world) end

---Finds collision objects whose Bullet broadphase bounds overlap the supplied
---world-space AABB. This is intentionally a broadphase query and can include
---objects whose actual collision geometry does not intersect the box. Use
---`bullet3d.world.overlap_point` or
---`bullet3d.world.overlap_shape` for exact narrow-phase overlap tests.
---@param world btDiscreteDynamicsWorld world handle
---@param aabb bullet3d.world.aabb world-space bounds
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum number of results, or zero for all
---@return btCollisionObject[] objects array of overlapping collision-object handles
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.overlap_aabb:world-aabb-filter-max_results)
function bullet3d.world.overlap_aabb(world, aabb, filter, max_results) end

---Performs an exact narrow-phase test using a temporary zero-radius Bullet
---sphere at the world-space point. A result is returned only for a contact with
---signed distance less than or equal to zero, so broadphase-only false positives
---are removed. Results on an exact surface follow Bullet's contact tolerance.
---@param world btDiscreteDynamicsWorld world handle
---@param point vector3 point in world space
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum number of results, or zero for all
---@return btCollisionObject[] objects array of overlapping collision-object handles
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.overlap_point:world-point-filter-max_results)
function bullet3d.world.overlap_point(world, point, filter, max_results) end

---Performs an exact Bullet contact test for a temporary sphere, box, Y-axis
---capsule, or convex hull. Multiple native contact points for the same target
---object are deduplicated in the returned overlap array.
---
---**Examples:**
---
---Find non-trigger objects overlapping a two-unit sphere around this game object:
---
---```lua
---function init(self)
---    local world = bullet3d.get_world()
---    local shape = {
---        type = bullet3d.shape.SHAPE_TYPE_SPHERE,
---        diameter = 2,
---        position = go.get_world_position(),
---    }
---    local filter = { include_triggers = false }
---    local overlaps = bullet3d.world.overlap_shape(world, shape, filter)
---
---    for _, object in ipairs(overlaps) do
---        print("overlap", object)
---    end
---end
---```
---@param world btDiscreteDynamicsWorld world handle
---@param shape bullet3d.shape.definition convex query shape
---@param filter? bullet3d.world.query_filter query filter
---@param max_results? integer maximum number of results, or zero for all
---@return btCollisionObject[] objects array of overlapping collision-object handles
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.overlap_shape:world-shape-filter-max_results)
function bullet3d.world.overlap_shape(world, shape, filter, max_results) end

---Bullet propagates the new value to active dynamic bodies unless they have
---`bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY` set. Such bodies retain their
---custom body gravity.
---
---**Examples:**
---
---Set gravity for the current collection's physics world:
---
---```lua
---function init(self)
---    local world = bullet3d.get_world()
---    if world then
---        bullet3d.world.set_gravity(world, vmath.vector3(0, -9.81, 0))
---    end
---end
---```
---@param world btDiscreteDynamicsWorld world handle
---@param gravity vector3 finite gravity in Defold units per second squared
---
---[Open in Browser](https://defold.com/ref/bullet3d.world-lua#bullet3d.world.set_gravity:world-gravity)
function bullet3d.world.set_gravity(world, gravity) end
