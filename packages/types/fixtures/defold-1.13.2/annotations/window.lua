--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.window
---Functions and constants to access the window, window event listeners
---and screen dimming.
---dimming mode off Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.DIMMING)
---@field DIMMING_OFF window.DIMMING
---dimming mode on Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.DIMMING)
---@field DIMMING_ON window.DIMMING
---dimming mode unknown Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction. This mode indicates that the dim mode can't be determined, or that the platform doesn't support dimming.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.DIMMING)
---@field DIMMING_UNKNOWN window.DIMMING
---deiconified window event    This event is sent to a window event listener when the game window or app screen is restored after being iconified.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@field WINDOW_EVENT_DEICONIFIED window.WINDOW_EVENT
---focus gained window event This event is sent to a window event listener when the game window or app screen has gained focus. This event is also sent at game startup and the engine gives focus to the game.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@field WINDOW_EVENT_FOCUS_GAINED window.WINDOW_EVENT
---focus lost window event This event is sent to a window event listener when the game window or app screen has lost focus.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@field WINDOW_EVENT_FOCUS_LOST window.WINDOW_EVENT
---iconify window event    This event is sent to a window event listener when the game window or app screen is iconified (reduced to an application icon in a toolbar, application tray or similar).
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@field WINDOW_EVENT_ICONIFIED window.WINDOW_EVENT
---resized window event This event is sent to a window event listener when the game window or app screen is resized. The new size is passed along in the data field to the event listener.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@field WINDOW_EVENT_RESIZED window.WINDOW_EVENT
window = {}

---@enum defold_enum.window.DIMMING: integer
local __defold_enum_window_DIMMING = {
    DIMMING_OFF = nil,
    DIMMING_ON = nil,
    DIMMING_UNKNOWN = nil,
}

---Screen-dimming modes
---
---[Open in Browser](https://defold.com/ref/window-lua#window.DIMMING)
---@alias window.DIMMING defold_enum.window.DIMMING
---| `window.DIMMING_OFF`
---| `window.DIMMING_ON`
---| `window.DIMMING_UNKNOWN`

---@enum defold_enum.window.WINDOW_EVENT: integer
local __defold_enum_window_WINDOW_EVENT = {
    WINDOW_EVENT_DEICONIFIED = nil,
    WINDOW_EVENT_FOCUS_GAINED = nil,
    WINDOW_EVENT_FOCUS_LOST = nil,
    WINDOW_EVENT_ICONIFIED = nil,
    WINDOW_EVENT_RESIZED = nil,
}

---Window events
---
---[Open in Browser](https://defold.com/ref/window-lua#window.WINDOW_EVENT)
---@alias window.WINDOW_EVENT defold_enum.window.WINDOW_EVENT
---| `window.WINDOW_EVENT_DEICONIFIED`
---| `window.WINDOW_EVENT_FOCUS_GAINED`
---| `window.WINDOW_EVENT_FOCUS_LOST`
---| `window.WINDOW_EVENT_ICONIFIED`
---| `window.WINDOW_EVENT_RESIZED`

---Returns the current dimming mode set on a mobile device.
---
---The dimming mode specifies whether or not a mobile device should dim the screen after a period without user interaction.
---
---On platforms that does not support dimming, `window.DIMMING_UNKNOWN` is always returned.
---@return window.DIMMING mode The mode for screen dimming
---
---[Open in Browser](https://defold.com/ref/window-lua#window.get_dim_mode:)
function window.get_dim_mode() end

---This returns the content scale of the current display.
---@return number scale The display scale
---
---[Open in Browser](https://defold.com/ref/window-lua#window.get_display_scale:)
function window.get_display_scale() end

---This returns the current lock state of the mouse cursor
---@return boolean state The lock state
---
---[Open in Browser](https://defold.com/ref/window-lua#window.get_mouse_lock:)
function window.get_mouse_lock() end

---This returns the safe area rectangle (x, y, width, height) and the inset
---values relative to the window edges. On platforms without a safe area,
---this returns the full window size and zero insets.
---@return window.safe_area safe_area safe area data
---
---[Open in Browser](https://defold.com/ref/window-lua#window.get_safe_area:)
function window.get_safe_area() end

---This returns the current window size (width and height).
---@return integer width The window width
---@return integer height The window height
---
---[Open in Browser](https://defold.com/ref/window-lua#window.get_size:)
function window.get_size() end

---Sets the dimming mode on a mobile device.
---
---The dimming mode specifies whether or not a mobile device should dim the screen after a period without user interaction. The dimming mode will only affect the mobile device while the game is in focus on the device, but not when the game is running in the background.
---
---This function has no effect on platforms that does not support dimming.
---@param mode window.DIMMING The mode for screen dimming
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_dim_mode:mode)
function window.set_dim_mode(mode) end

---Sets a window event listener. Only one window event listener can be set at a time.
---
---**Examples:**
---
---```lua
---function window_callback(self, event, data)
---    if event == window.WINDOW_EVENT_FOCUS_LOST then
---        print("window.WINDOW_EVENT_FOCUS_LOST")
---    elseif event == window.WINDOW_EVENT_FOCUS_GAINED then
---        print("window.WINDOW_EVENT_FOCUS_GAINED")
---    elseif event == window.WINDOW_EVENT_ICONIFIED then
---        print("window.WINDOW_EVENT_ICONIFIED")
---    elseif event == window.WINDOW_EVENT_DEICONIFIED then
---        print("window.WINDOW_EVENT_DEICONIFIED")
---    elseif event == window.WINDOW_EVENT_RESIZED then
---        print("Window resized: ", data.width, data.height)
---    end
---end
---
---function init(self)
---    window.set_listener(window_callback)
---end
---```
---@param callback fun(self:script_instance, event:window.WINDOW_EVENT, data:window.event_data)|nil A callback which receives info about window events. Pass an empty function or `nil` if you no longer wish to receive callbacks.
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_listener:callback)
function window.set_listener(callback) end

---Set the locking state for current mouse cursor on a PC platform.
---
---This function locks or unlocks the mouse cursor to the center point of the window. While the cursor is locked,
---mouse position updates will still be sent to the scripts as usual.
---@param flag boolean The lock state for the mouse cursor
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_mouse_lock:flag)
function window.set_mouse_lock(flag) end

---Sets the window position.
---@param x integer Horizontal position of window
---@param y integer Vertical position of window
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_position:x-y)
function window.set_position(x, y) end

---Sets the window size. Works on desktop platforms only.
---@param width integer Width of window
---@param height integer Height of window
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_size:width-height)
function window.set_size(width, height) end

---Sets the window title. Works on desktop platforms.
---@param title string The title, encoded as UTF-8
---
---[Open in Browser](https://defold.com/ref/window-lua#window.set_title:title)
function window.set_title(title) end
