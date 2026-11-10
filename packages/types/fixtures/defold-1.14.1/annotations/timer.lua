--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.timer
---Timers allow you to set a delay and a callback to be called when the timer completes.
---
---The timers created with this API are updated with the collection timer where they
---are created. If you pause or speed up the collection (using `set_time_step`) it will
---also affect the new timer.
---Indicates an invalid timer handle
---
---[Open in Browser](https://defold.com/ref/timer-lua#timer.INVALID_TIMER_HANDLE)
---@field INVALID_TIMER_HANDLE timer_handle
timer = {}

---You may cancel a timer from inside a timer callback.
---Cancelling a timer that is already executed or cancelled is safe.
---
---**Examples:**
---
---```lua
---self.handle = timer.delay(1, true, function() print("print every second") end)
---...
---local cancelled = timer.cancel(self.handle)
---if not cancelled then
---   print("the timer is already cancelled")
---end
---```
---@param handle timer_handle the timer handle returned by timer.delay()
---@return boolean cancelled `true` if the timer was active and cancelled, `false` if the timer was already cancelled or complete
---
---[Open in Browser](https://defold.com/ref/timer-lua#timer.cancel:handle)
function timer.cancel(handle) end

---Adds a timer and returns a unique handle.
---
---You may create more timers from inside a timer callback.
---
---Using a delay of 0 will result in a timer that triggers at the next frame just before
---script update functions.
---
---If you want a timer that triggers on each frame, set delay to 0.0f and repeat to true.
---
---Timers created within a script will automatically die when the script is deleted.
---
---**Examples:**
---
---A simple one-shot timer
---```lua
---timer.delay(1, false, function() print("print in one second") end)
---```
---
---Repetitive timer which canceled after 10 calls
---```lua
---local function call_every_second(self, handle, time_elapsed)
---  self.counter = self.counter + 1
---  print("Call #", self.counter)
---  if self.counter == 10 then
---    timer.cancel(handle) -- cancel timer after 10 calls
---  end
---end
---
---self.counter = 0
---timer.delay(1, true, call_every_second)
---```
---@param delay number time interval in seconds
---@param repeating boolean true = repeat timer until cancel, false = one-shot timer
---@param callback fun(self:script_instance, handle:timer_handle, time_elapsed:number) timer callback function  `self` `script_instance` The current script instance  `handle` `timer_handle` The handle of the timer  `time_elapsed` `number` The elapsed time - on first trigger it is time since timer.delay call, otherwise time since last trigger
---@return timer_handle handle identifier for the create timer, returns timer.INVALID_TIMER_HANDLE if the timer can not be created
---
---[Open in Browser](https://defold.com/ref/timer-lua#timer.delay:delay-repeating-callback)
function timer.delay(delay, repeating, callback) end

---Get information about timer.
---
---**Examples:**
---
---```lua
---self.handle = timer.delay(1, true, function() print("print every second") end)
---...
---local result = timer.get_info(self.handle)
---if not result then
---   print("the timer is already cancelled or complete")
---else
---   pprint(result) -- delay, time_remaining, repeating
---end
---
---```
---@param handle timer_handle the timer handle returned by timer.delay()
---@return timer.info|nil data timer information, or `nil` if the timer is cancelled or complete
---
---[Open in Browser](https://defold.com/ref/timer-lua#timer.get_info:handle)
function timer.get_info(handle) end

---Manual triggering a callback for a timer.
---
---**Examples:**
---
---```lua
---self.handle = timer.delay(1, true, function() print("print every second or manually by timer.trigger") end)
---...
---local triggered = timer.trigger(self.handle)
---if not triggered then
---   print("the timer is already cancelled or complete")
---end
---```
---@param handle timer_handle the timer handle returned by timer.delay()
---@return boolean triggered `true` if the timer was active and triggered, `false` if the timer was already cancelled or complete
---
---[Open in Browser](https://defold.com/ref/timer-lua#timer.trigger:handle)
function timer.trigger(handle) end
