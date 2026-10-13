--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.physics
---Collision object physics API documentation
---Fixed joint; uses `max_length` from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_FIXED physics.JOINT_TYPE
---Hinge joint; uses the angular-limit and motor fields from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_HINGE physics.JOINT_TYPE
---Slider joint; uses the translation-limit and motor fields from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_SLIDER physics.JOINT_TYPE
---Spring joint; uses `length`, `frequency`, and `damping` from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_SPRING physics.JOINT_TYPE
---Weld joint; uses `reference_angle`, `frequency`, and `damping` from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_WELD physics.JOINT_TYPE
---Wheel joint; uses the axis, motor, frequency, and damping fields from `physics.joint_properties`.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@field JOINT_TYPE_WHEEL physics.JOINT_TYPE
---Box shape.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@field SHAPE_TYPE_BOX physics.SHAPE_TYPE
---Capsule shape; supported only by 3D physics.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@field SHAPE_TYPE_CAPSULE physics.SHAPE_TYPE
---Convex hull shape.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@field SHAPE_TYPE_HULL physics.SHAPE_TYPE
---Triangle mesh shape; supported only by the Bullet 3D backend.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@field SHAPE_TYPE_MESH physics.SHAPE_TYPE
---Sphere shape.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@field SHAPE_TYPE_SPHERE physics.SHAPE_TYPE
physics = {}

---@enum defold_enum.physics.JOINT_TYPE: integer
local __defold_enum_physics_JOINT_TYPE = {
    JOINT_TYPE_FIXED = nil,
    JOINT_TYPE_HINGE = nil,
    JOINT_TYPE_SLIDER = nil,
    JOINT_TYPE_SPRING = nil,
    JOINT_TYPE_WELD = nil,
    JOINT_TYPE_WHEEL = nil,
}

---Joint types
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.JOINT_TYPE)
---@alias physics.JOINT_TYPE defold_enum.physics.JOINT_TYPE
---| `physics.JOINT_TYPE_FIXED`
---| `physics.JOINT_TYPE_HINGE`
---| `physics.JOINT_TYPE_SLIDER`
---| `physics.JOINT_TYPE_SPRING`
---| `physics.JOINT_TYPE_WELD`
---| `physics.JOINT_TYPE_WHEEL`

---@enum defold_enum.physics.SHAPE_TYPE: integer
local __defold_enum_physics_SHAPE_TYPE = {
    SHAPE_TYPE_BOX = nil,
    SHAPE_TYPE_CAPSULE = nil,
    SHAPE_TYPE_HULL = nil,
    SHAPE_TYPE_MESH = nil,
    SHAPE_TYPE_SPHERE = nil,
}

---Shape types
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.SHAPE_TYPE)
---@alias physics.SHAPE_TYPE defold_enum.physics.SHAPE_TYPE
---| `physics.SHAPE_TYPE_BOX`
---| `physics.SHAPE_TYPE_CAPSULE`
---| `physics.SHAPE_TYPE_HULL`
---| `physics.SHAPE_TYPE_MESH`
---| `physics.SHAPE_TYPE_SPHERE`

---Create a physics joint between two collision object components.
---
---Note: Currently only supported in 2D physics.
---@param joint_type physics.JOINT_TYPE the joint type
---@param collisionobject_a string|hash|url first collision object
---@param joint_id string|hash id of the joint
---@param position_a vector3 local position where to attach the joint on the first collision object
---@param collisionobject_b string|hash|url second collision object
---@param position_b vector3 local position where to attach the joint on the second collision object
---@param properties? physics.joint_properties optional joint-specific properties
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.create_joint:joint_type-collisionobject_a-joint_id-position_a-collisionobject_b-position_b-properties)
function physics.create_joint(joint_type, collisionobject_a, joint_id, position_a, collisionobject_b, position_b, properties) end

---Destroy an already physics joint. The joint has to be created before a
---destroy can be issued.
---
---Note: Currently only supported in 2D physics.
---@param collisionobject string|hash|url collision object where the joint exist
---@param joint_id string|hash id of the joint
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.destroy_joint:collisionobject-joint_id)
function physics.destroy_joint(collisionobject, joint_id) end

---Get the gravity in runtime. The gravity returned is not global, it will return
---the gravity for the collection that the function is called from.
---
---Note: For 2D physics the z component will always be zero.
---
---**Examples:**
---
---```lua
---function init(self)
---    local gravity = physics.get_gravity()
---    -- Inverse gravity!
---    gravity = -gravity
---    physics.set_gravity(gravity)
---end
---```
---@return vector3 gravity gravity vector of collection
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_gravity:)
function physics.get_gravity() end

---Returns the group name of a collision object as a hash.
---
---**Examples:**
---
---```lua
---local function check_is_enemy()
---    local group = physics.get_group("#collisionobject")
---    return group == hash("enemy")
---end
---```
---@param url string|hash|url the collision object to return the group of.
---@return hash group hash value of the group.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_group:url)
function physics.get_group(url) end

---Get a table for properties for a connected joint. The joint has to be created before
---properties can be retrieved.
---
---Note: Currently only supported in 2D physics.
---@param collisionobject string|hash|url collision object where the joint exist
---@param joint_id string|hash id of the joint
---@return physics.joint_properties_info properties joint properties
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_joint_properties:collisionobject-joint_id)
function physics.get_joint_properties(collisionobject, joint_id) end

---Get the reaction force for a joint. The joint has to be created before
---the reaction force can be calculated.
---
---Note: Currently only supported in 2D physics.
---@param collisionobject string|hash|url collision object where the joint exist
---@param joint_id string|hash id of the joint
---@return vector3 force reaction force for the joint
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_joint_reaction_force:collisionobject-joint_id)
function physics.get_joint_reaction_force(collisionobject, joint_id) end

---Get the reaction torque for a joint. The joint has to be created before
---the reaction torque can be calculated.
---
---Note: Currently only supported in 2D physics.
---@param collisionobject string|hash|url collision object where the joint exist
---@param joint_id string|hash id of the joint
---@return number torque the reaction torque on bodyB in N*m.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_joint_reaction_torque:collisionobject-joint_id)
function physics.get_joint_reaction_torque(collisionobject, joint_id) end

---Returns true if the specified group is set in the mask of a collision
---object, false otherwise.
---
---**Examples:**
---
---```lua
---local function is_invincible()
---    -- check if the collisionobject would collide with the "bullet" group
---    local invincible = physics.get_maskbit("#collisionobject", "bullet")
---    return invincible
---end
---```
---@param url string|hash|url the collision object to check the mask of.
---@param group string the name of the group to check for.
---@return boolean maskbit boolean value of the maskbit. 'true' if present, 'false' otherwise.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_maskbit:url-group)
function physics.get_maskbit(url, group) end

---Gets collision shape data from a collision object
---
---**Examples:**
---
---```lua
---local function get_shape_meta()
---    local sphere = physics.get_shape("#collisionobject", "my_sphere_shape")
---    -- returns a table with sphere.diameter
---    return sphere
---end
---```
---@param url string|hash|url the collision object.
---@param shape string|hash the name of the shape to get data for.
---@return physics.shape_data table collision shape data
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.get_shape:url-shape)
function physics.get_shape(url, shape) end

---Ray casts are used to test for intersections against collision objects in the physics world.
---Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
---do not intersect with ray casts.
---Which collision objects to hit is filtered by their collision groups and can be configured
---through `groups`.
---
---NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
---
---**Examples:**
---
---How to perform a ray cast synchronously:
---
---```lua
---function init(self)
---    self.groups = {hash("world"), hash("enemy")}
---end
---
---function update(self, dt)
---    -- request ray cast
---    local result = physics.raycast(from, to, self.groups, {all=true})
---    if result ~= nil then
---        -- act on the hit (see 'ray_cast_response')
---        for _,result in ipairs(results) do
---            handle_result(result)
---        end
---    end
---end
---```
---@param from vector3 the world position of the start of the ray
---@param to vector3 the world position of the end of the ray
---@param groups hash[] a lua table containing the hashed groups for which to test collisions against
---@param options? physics.raycast_options optional ray-cast options
---@return message.physics.ray_cast_response[]|message.physics.ray_cast_response|nil result It returns a list. If missed it returns `nil`. See `ray_cast_response` for details on the returned values.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.raycast:from-to-groups-options)
function physics.raycast(from, to, groups, options) end

---Ray casts are used to test for intersections against collision objects in the physics world.
---Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
---do not intersect with ray casts.
---Which collision objects to hit is filtered by their collision groups and can be configured
---through `groups`.
---The actual ray cast will be performed during the physics-update.
---
---- If an object is hit, the result will be reported via a `ray_cast_response` message.
---- If there is no object hit, the result will be reported via a `ray_cast_missed` message.
---
---NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
---
---**Examples:**
---
---How to perform a ray cast asynchronously:
---
---```lua
---function init(self)
---    self.my_groups = {hash("my_group1"), hash("my_group2")}
---end
---
---function update(self, dt)
---    -- request ray cast
---    physics.raycast_async(my_start, my_end, self.my_groups)
---end
---
---function on_message(self, message_id, message, sender)
---    -- check for the response
---    if message_id == hash("ray_cast_response") then
---        -- act on the hit
---    elseif message_id == hash("ray_cast_missed") then
---        -- act on the miss
---    end
---end
---```
---@param from vector3 the world position of the start of the ray
---@param to vector3 the world position of the end of the ray
---@param groups hash[] a lua table containing the hashed groups for which to test collisions against
---@param request_id? integer a number in range [0,255]. It will be sent back in the response for identification, 0 by default
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.raycast_async:from-to-groups-request_id)
function physics.raycast_async(from, to, groups, request_id) end

---Only one physics world event listener can be set at a time.
---
---**Examples:**
---
---```lua
---local function physics_world_listener(self, events)
---  for _,event in ipairs(events) do
---      local event_type = event["type"]
---      if event_type == hash("contact_point_event") then
---          pprint(event)
---          -- {
---          --  distance = 2.1490633487701,
---          --  applied_impulse = 0
---          --  a = { --[[0x113f7c6c0]]
---          --    group = hash: [box],
---          --    id = hash: [/box]
---          --    mass = 0,
---          --    normal = vmath.vector3(0.379, 0.925, -0),
---          --    position = vmath.vector3(517.337, 235.068, 0),
---          --    instance_position = vmath.vector3(480, 144, 0),
---          --    relative_velocity = vmath.vector3(-0, -0, -0),
---          --  },
---          --  b = { --[[0x113f7c840]]
---          --    group = hash: [circle],
---          --    id = hash: [/circle]
---          --    mass = 0,
---          --    normal = vmath.vector3(-0.379, -0.925, 0),
---          --    position = vmath.vector3(517.337, 235.068, 0),
---          --    instance_position = vmath.vector3(-0.0021, 0, -0.0022),
---          --    relative_velocity = vmath.vector3(0, 0, 0),
---          --  },
---          -- }
---      elseif event_type == hash("collision_event") then
---          pprint(event)
---          -- {
---          --  a = {
---          --          group = hash: [default],
---          --          position = vmath.vector3(183, 666, 0),
---          --          id = hash: [/go1]
---          --      },
---          --  b = {
---          --          group = hash: [default],
---          --          position = vmath.vector3(185, 704.05865478516, 0),
---          --          id = hash: [/go2]
---          --      }
---          -- }
---      elseif event_type ==  hash("trigger_event") then
---          pprint(event)
---          -- {
---          --  enter = true,
---          --  b = {
---          --      group = hash: [default],
---          --      id = hash: [/go2]
---          --  },
---          --  a = {
---          --      group = hash: [default],
---          --      id = hash: [/go1]
---          --  }
---          -- },
---      elseif event_type ==  hash("ray_cast_response") then
---          pprint(event)
---          --{
---          --  group = hash: [default],
---          --  request_id = 0,
---          --  position = vmath.vector3(249.92222595215, 249.92222595215, 0),
---          --  fraction = 0.68759721517563,
---          --  normal = vmath.vector3(0, 1, 0),
---          --  id = hash: [/go]
---          -- }
---      elseif event_type ==  hash("ray_cast_missed") then
---          pprint(event)
---          -- {
---          --  request_id = 0
---          --},
---      end
---end
---
---function init(self)
---    physics.set_event_listener(physics_world_listener)
---end
---```
---@param callback fun(self:script_instance, events:physics.event[])|nil A callback that receives information about all physics interactions in this physics world. Pass `nil` to remove the listener.  `self` `script_instance` The calling script instance  `events` `physics.event[]` An array of event tables. Each event table contains a `type` field with the hashed name of one of these messages, together with fields specific to that event type:  - `contact_point_event` - `collision_event` - `trigger_event` - `ray_cast_response` - `ray_cast_missed`
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_event_listener:callback)
function physics.set_event_listener(callback) end

---Set the gravity in runtime. The gravity change is not global, it will only affect
---the collection that the function is called from.
---
---Note: For 2D physics the z component of the gravity vector will be ignored.
---
---**Examples:**
---
---```lua
---function init(self)
---    -- Set "upside down" gravity for this collection.
---    physics.set_gravity(vmath.vector3(0, 10.0, 0))
---end
---```
---@param gravity vector3 the new gravity vector
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_gravity:gravity)
function physics.set_gravity(gravity) end

---Updates the group property of a collision object to the specified
---string value. The group name should exist i.e. have been used in
---a collision object in the editor.
---
---**Examples:**
---
---```lua
---local function change_collision_group()
---     physics.set_group("#collisionobject", "enemy")
---end
---```
---@param url string|hash|url the collision object affected.
---@param group string the new group name to be assigned.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_group:url-group)
function physics.set_group(url, group) end

---Flips the collision shapes horizontally for a collision object
---
---**Examples:**
---
---```lua
---function init(self)
---    self.fliph = true -- set on some condition
---    physics.set_hflip("#collisionobject", self.fliph)
---end
---```
---@param url string|hash|url the collision object that should flip its shapes
---@param flip boolean `true` if the collision object should flip its shapes, `false` if not
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_hflip:url-flip)
function physics.set_hflip(url, flip) end

---Updates the properties for an already connected joint. The joint has to be created before
---properties can be changed.
---
---Note: Currently only supported in 2D physics.
---@param collisionobject string|hash|url collision object where the joint exist
---@param joint_id string|hash id of the joint
---@param properties physics.joint_properties joint specific properties table  Note: The `collide_connected` field cannot be updated/changed after a connection has been made.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_joint_properties:collisionobject-joint_id-properties)
function physics.set_joint_properties(collisionobject, joint_id, properties) end

---Sets or clears the masking of a group (maskbit) in a collision object.
---
---**Examples:**
---
---```lua
---local function make_invincible()
---    -- no longer collide with the "bullet" group
---    physics.set_maskbit("#collisionobject", "bullet", false)
---end
---```
---@param url string|hash|url the collision object to change the mask of.
---@param group string the name of the group (maskbit) to modify in the mask.
---@param maskbit boolean boolean value of the new maskbit. 'true' to enable, 'false' to disable.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_maskbit:url-group-maskbit)
function physics.set_maskbit(url, group, maskbit) end

---Sets collision shape data for a collision object. Please note that updating data in 3D
---can be quite costly for box and capsules. Because of the physics engine, the cost
---comes from having to recreate the shape objects when certain shapes needs to be updated.
---
---**Examples:**
---
---```lua
---local function set_shape_data()
---    -- set capsule shape data
---    local data = {}
---    data.type = physics.SHAPE_TYPE_CAPSULE
---    data.diameter = 10
---    data.height = 20
---    physics.set_shape("#collisionobject", "my_capsule_shape", data)
---
---    -- set sphere shape data
---    data = {}
---    data.type = physics.SHAPE_TYPE_SPHERE
---    data.diameter = 10
---    physics.set_shape("#collisionobject", "my_sphere_shape", data)
---
---    -- set box shape data
---    data = {}
---    data.type = physics.SHAPE_TYPE_BOX
---    data.dimensions = vmath.vector3(10, 10, 5)
---    physics.set_shape("#collisionobject", "my_box_shape", data)
---end
---```
---@param url string|hash|url the collision object.
---@param shape string|hash the name of the shape to get data for.
---@param table physics.shape_data updated collision shape data  Hull and mesh geometry cannot be changed with this function.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_shape:url-shape-table)
function physics.set_shape(url, shape, table) end

---Flips the collision shapes vertically for a collision object
---
---**Examples:**
---
---```lua
---function init(self)
---    self.flipv = true -- set on some condition
---    physics.set_vflip("#collisionobject", self.flipv)
---end
---```
---@param url string|hash|url the collision object that should flip its shapes
---@param flip boolean `true` if the collision object should flip its shapes, `false` if not
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.set_vflip:url-flip)
function physics.set_vflip(url, flip) end

---The function recalculates the density of each shape based on the total area of all shapes and the specified mass, then updates the mass of the body accordingly.
---
---Note: Currently only supported in 2D physics.
---
---**Examples:**
---
---```lua
--- physics.update_mass("#collisionobject", 14)
---```
---@param collisionobject string|hash|url the collision object whose mass needs to be updated.
---@param mass number the new mass value to set for the collision object.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.update_mass:collisionobject-mass)
function physics.update_mass(collisionobject, mass) end

---Collision objects tend to fall asleep when inactive for a small period of time for
---efficiency reasons. This function wakes them up.
---
---**Examples:**
---
---```lua
---function on_input(self, action_id, action)
---    if action_id == hash("test") and action.pressed then
---        physics.wakeup("#collisionobject")
---    end
---end
---```
---@param url string|hash|url the collision object to wake.
---
---[Open in Browser](https://defold.com/ref/physics-lua#physics.wakeup:url)
function physics.wakeup(url) end
