--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.sprite
---Sprite API documentation
sprite = {}

---Play an animation on a sprite component from its tile set
---
---An optional completion callback function can be provided that will be called when
---the animation has completed playing. If no function is provided,
---a `animation_done` message is sent to the script that started the animation.
---
---**Examples:**
---
---The following examples assumes that the model has id "sprite".
---
---How to play the "jump" animation followed by the "run" animation:
---
---```lua
---local function anim_done(self, message_id, message, sender)
---  if message_id == hash("animation_done") then
---    if message.id == hash("jump") then
---      -- jump animation done, chain with "run"
---      sprite.play_flipbook(url, "run")
---    end
---  end
---end
---```
---
---```lua
---function init(self)
---  local url = msg.url("#sprite")
---  sprite.play_flipbook(url, "jump", anim_done)
---end
---```
---@param url string|hash|url the sprite that should play the animation
---@param id string|hash hashed id of the animation to play
---@param complete_function? fun(self:script_instance, message_id:hash, message:message.sprite.animation_done, sender:url) function to call when the animation has completed.  `self` `script_instance` The current script instance.  `message_id` `hash` The name of the completion message, `"animation_done"`.  `message` `message.sprite.animation_done` Information about the completion.  `sender` `url` The invoker of the callback: the sprite component.
---@param play_properties? sprite.play_properties optional playback properties
---
---[Open in Browser](https://defold.com/ref/sprite-lua#sprite.play_flipbook:url-id-complete_function-play_properties)
function sprite.play_flipbook(url, id, complete_function, play_properties) end

---Resets a shader constant for a sprite component.
---The constant must be defined in the material assigned to the sprite.
---Resetting a constant through this function implies that the value defined in the material will be used.
---Which sprite to reset a constant for is identified by the URL.
---
---**Examples:**
---
---The following examples assumes that the sprite has id "sprite" and that the default-material in builtins is used, which defines the constant "tint".
---If you assign a custom material to the sprite, you can reset the constants defined there in the same manner.
---
---How to reset the tinting of a sprite:
---
---```lua
---function init(self)
---  sprite.reset_constant("#sprite", "tint")
---end
---```
---@param url string|hash|url the sprite that should have a constant reset
---@param constant string|hash name of the constant
---
---[Open in Browser](https://defold.com/ref/sprite-lua#sprite.reset_constant:url-constant)
function sprite.reset_constant(url, constant) end

---Sets horizontal flipping of the provided sprite's animations.
---The sprite is identified by its URL.
---If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
---
---**Examples:**
---
---How to flip a sprite so it faces the horizontal movement:
---
---```lua
---function update(self, dt)
---  -- calculate self.velocity somehow
---  sprite.set_hflip("#sprite", self.velocity.x < 0)
---end
---```
---
---It is assumed that the sprite component has id "sprite" and that the original animations faces right.
---@param url string|hash|url the sprite that should flip its animations
---@param flip boolean `true` if the sprite should flip its animations, `false` if not
---
---[Open in Browser](https://defold.com/ref/sprite-lua#sprite.set_hflip:url-flip)
function sprite.set_hflip(url, flip) end

---Sets vertical flipping of the provided sprite's animations.
---The sprite is identified by its URL.
---If the currently playing animation is flipped by default, flipping it again will make it appear like the original texture.
---
---**Examples:**
---
---How to flip a sprite in a game which negates gravity as a game mechanic:
---
---```lua
---function update(self, dt)
---  -- calculate self.up_side_down somehow, then:
---  sprite.set_vflip("#sprite", self.up_side_down)
---end
---```
---
---It is assumed that the sprite component has id "sprite" and that the original animations are up-right.
---@param url string|hash|url the sprite that should flip its animations
---@param flip boolean `true` if the sprite should flip its animations, `false` if not
---
---[Open in Browser](https://defold.com/ref/sprite-lua#sprite.set_vflip:url-flip)
function sprite.set_vflip(url, flip) end
