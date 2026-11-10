--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.model
---Model API documentation
model = {}

---Cancels all animation on a model component.
---@param url string|hash|url the model for which to cancel the animation
---
---[Open in Browser](https://defold.com/ref/model-lua#model.cancel:url)
function model.cancel(url) end

---Get AABB of the whole model in local coordinate space.
---
---**Examples:**
---
---```lua
---model.get_aabb("#model") -> { min = vmath.vector3(-2.5, -3.0, 0), max = vmath.vector3(1.5, 5.5, 0) }
---model.get_aabb("#empty") -> { min = vmath.vector3(0, 0, 0), max = vmath.vector3(0, 0, 0) }
---```
---@param url string|hash|url the model
---@return model.aabb aabb model bounds; an empty model returns zero vectors
---
---[Open in Browser](https://defold.com/ref/model-lua#model.get_aabb:url)
function model.get_aabb(url) end

---Returns a table of numbers with one entry per morph target on the first mesh of the model that has morph targets.
---Values reflect the rig state at call time (after animation, and any active script override from `model.set_blend_weights`).
---
---**Examples:**
---
---```lua
---local w = model.get_blend_weights("#model")
---for i = 1, #w do
---  print(i, w[i])
---end
----- change the data in the table and then set the weights again
---w[1] = 0.75
---w[2] = 0.25
---model.set_blend_weights("#model", w)
---```
---@param url string|hash|url the model component
---@return number[] weights array of weight values, or empty table if the model has no morph targets
---
---[Open in Browser](https://defold.com/ref/model-lua#model.get_blend_weights:url)
function model.get_blend_weights(url) end

---Gets the id of the game object that corresponds to a model skeleton bone.
---The returned game object can be used for parenting and transform queries.
---This function has complexity `O(n)`, where `n` is the number of bones in the model skeleton.
---Game objects corresponding to a model skeleton bone can not be individually deleted.
---
---**Examples:**
---
---The following examples assumes that the model component has id "model".
---
---How to parent the game object of the calling script to the "right_hand" bone of the model in a player game object:
---
---```lua
---function init(self)
---    local parent = model.get_go("player#model", "right_hand")
---    msg.post(".", "set_parent", {parent_id = parent})
---end
---```
---@param url string|hash|url the model to query
---@param bone_id string|hash id of the corresponding bone
---@return hash id id of the game object
---
---[Open in Browser](https://defold.com/ref/model-lua#model.get_go:url-bone_id)
function model.get_go(url, bone_id) end

---Get AABB of all meshes.
---
---**Examples:**
---
---```lua
---model.get_mesh_aabb("#model") -> { hash("Sword") = { min = vmath.vector3(-0.5, -0.5, 0), max = vmath.vector3(0.5, 0.5, 0) }, hash("Shield") = { min = vmath.vector3(-0.5, -0.5, -0.5), max = vmath.vector3(0.5, 0.5, 0.5) } }
---```
---@param url string|hash|url the model
---@return table<hash, model.aabb> aabb mesh bounds keyed by mesh identifier
---
---[Open in Browser](https://defold.com/ref/model-lua#model.get_mesh_aabb:url)
function model.get_mesh_aabb(url) end

---Get the enabled state of a mesh
---
---**Examples:**
---
---```lua
---function init(self)
---    if model.get_mesh_enabled("#model", "Sword") then
---       -- set properties specific for the sword
---       self.weapon_properties = game.data.weapons["Sword"]
---    end
---end
---```
---@param url string|hash|url the model
---@param mesh_id string|hash|url the id of the mesh
---@return boolean enabled true if the mesh is visible, false otherwise
---
---[Open in Browser](https://defold.com/ref/model-lua#model.get_mesh_enabled:url-mesh_id)
function model.get_mesh_enabled(url, mesh_id) end

---Plays an animation on a model component with specified playback
---mode and parameters.
---
---An optional completion callback function can be provided that will be called when
---the animation has completed playing. If no function is provided,
---a `model_animation_done` message is sent to the script that started the animation.
---
---The callback is not called (or message sent) if the animation is
---cancelled with `model.cancel`. The callback is called (or message sent) only for
---animations that play with the following playback modes:
---
---- `go.PLAYBACK_ONCE_FORWARD`
---- `go.PLAYBACK_ONCE_BACKWARD`
---- `go.PLAYBACK_ONCE_PINGPONG`
---
---**Examples:**
---
---The following examples assumes that the model has id "model".
---
---How to play the "jump" animation followed by the "run" animation:
---
---```lua
---local function anim_done(self, message_id, message, sender)
---  if message_id == hash("model_animation_done") then
---    if message.animation_id == hash("jump") then
---      -- open animation done, chain with "run"
---      local properties = { blend_duration = 0.2 }
---      model.play_anim(url, "run", go.PLAYBACK_LOOP_FORWARD, properties, anim_done)
---    end
---  end
---end
---
---function init(self)
---    local url = msg.url("#model")
---    local play_properties = { blend_duration = 0.1 }
---    -- first blend during 0.1 sec into the jump, then during 0.2 s into the run animation
---    model.play_anim(url, "jump", go.PLAYBACK_ONCE_FORWARD, play_properties, anim_done)
---end
---```
---@param url string|hash|url the model for which to play the animation
---@param anim_id string|hash id of the animation to play
---@param playback go.PLAYBACK playback mode of the animation
---@param play_properties? model.play_properties optional playback properties
---@param complete_function? fun(self:script_instance, message_id:hash, message:message.model.model_animation_done, sender:url) function to call when the animation has completed.  `self` `script_instance` The current script instance.  `message_id` `hash` The name of the completion message, `"model_animation_done"`.  `message` `message.model.model_animation_done` Information about the completion.  `sender` `url` The invoker of the callback: the model component.
---
---[Open in Browser](https://defold.com/ref/model-lua#model.play_anim:url-anim_id-playback-play_properties-complete_function)
function model.play_anim(url, anim_id, playback, play_properties, complete_function) end

---Resets a shader constant for a model component.
---The constant must be defined in the material assigned to the model.
---Resetting a constant through this function implies that the value defined in the material will be used.
---Which model to reset a constant for is identified by the URL.
---
---**Examples:**
---
---The following examples assumes that the model has id "model" and that the default-material in builtins is used, which defines the constant "tint".
---If you assign a custom material to the model, you can reset the constants defined there in the same manner.
---
---How to reset the tinting of a model:
---
---```lua
---function init(self)
---    model.reset_constant("#model", "tint")
---end
---```
---@param url string|hash|url the model that should have a constant reset.
---@param constant string|hash name of the constant.
---
---[Open in Browser](https://defold.com/ref/model-lua#model.reset_constant:url-constant)
function model.reset_constant(url, constant) end

---Copies numeric values from `weights` into each morph target slot for every mesh on the model that has morph targets.
---At most as many weights are applied as each mesh has morph targets; extra entries in the table are ignored.
---Missing weights leave the tail zero-filled for meshes with more targets than entries.
---
---The override is re-applied every frame after animations run, until cleared by omitting `weights` or passing `nil`.
---To reset the weights, use `model.set_blend_weights(url)` or `model.set_blend_weights(url, nil)`.
---
---**Examples:**
---
---```lua
----- set the weights for the first 4 morph targets
---model.set_blend_weights("#model", { 0, 1, 0.5, 0 })
----- clear the override, animation will continue if the weights are driven by an animation
---model.set_blend_weights("#model") -- clear script override
---```
---@param url string|hash|url the model component
---@param weights? number[]|nil array of weight values (1-based indices). Omit or pass `nil` to clear the override and return morphs to animation only
---
---[Open in Browser](https://defold.com/ref/model-lua#model.set_blend_weights:url-weights)
function model.set_blend_weights(url, weights) end

---Enable or disable visibility of a mesh
---
---**Examples:**
---
---```lua
---function init(self)
---    model.set_mesh_enabled("#model", "Sword", false) -- hide the sword
---    model.set_mesh_enabled("#model", "Axe", true)    -- show the axe
---end
---```
---@param url string|hash|url the model
---@param mesh_id string|hash|url the id of the mesh
---@param enabled boolean true if the mesh should be visible, false if it should be hideen
---
---[Open in Browser](https://defold.com/ref/model-lua#model.set_mesh_enabled:url-mesh_id-enabled)
function model.set_mesh_enabled(url, mesh_id, enabled) end
