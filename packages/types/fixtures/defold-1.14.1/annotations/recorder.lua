--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.recorder
---Record the game window to an MP4 file. One recording may run at a time,
---shared with the engine's HTTP recording service.
---
---Recording is supported by desktop debug engines. The module is omitted from
---release, headless, mobile and web builds, and when recording is excluded through
---an app manifest. Unsupported desktop operating systems or capture environments
---return an error from `recorder.start`.
---Application audio support depends on the platform; audio is disabled by default.
---Recording failed; result.error contains the reason.
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.EVENT)
---@field EVENT_ERROR recorder.EVENT
---Recording has started.
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.EVENT)
---@field EVENT_STARTED recorder.EVENT
---Recording has stopped and the MP4 is ready to read.
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.EVENT)
---@field EVENT_STOPPED recorder.EVENT
recorder = {}

---@enum defold_enum.recorder.EVENT: integer
local __defold_enum_recorder_EVENT = {
    EVENT_STARTED = nil,
    EVENT_STOPPED = nil,
    EVENT_ERROR = nil,
}

---recording events
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.EVENT)
---@alias recorder.EVENT defold_enum.recorder.EVENT
---| `recorder.EVENT_STARTED`
---| `recorder.EVENT_STOPPED`
---| `recorder.EVENT_ERROR`

---Starts an asynchronous recording of the game window at its native pixel size.
---The caller owns the output file, which remains on disk after engine shutdown.
---An existing file at the specified path may be overwritten.
---
---A successful return only means the request was accepted. The callback receives
---`recorder.EVENT_STARTED` when capture starts, followed by
---`recorder.EVENT_STOPPED` or `recorder.EVENT_ERROR`. Startup failure produces
---only EVENT_ERROR. Callbacks run during engine update, never inside start/stop.
---
---Window resizing stops and finalizes the recording. Deleting the calling script
---discards its callback but does not stop recording. Engine shutdown finalizes
---recording without invoking callbacks.
---
---**Examples:**
---
---```lua
---local ok, err = recorder.start({
---    path = sys.get_save_file("my_game", "capture.mp4"),
---    fps = 30,
---    audio = false,
---}, function(self, event, result)
---    if event == recorder.EVENT_STOPPED then
---        print("Saved:", result.path)
---    elseif event == recorder.EVENT_ERROR then
---        print(result.error)
---    end
---end)
---if not ok then print(err) end
---```
---@param options recorder.options recording options
---@param callback fun(self:script_instance, event:recorder.EVENT, result:recorder.result) recording event callback
---@return boolean|nil accepted true if accepted, otherwise nil
---@return string|nil error reason the request was rejected
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.start:options-callback)
function recorder.start(options, callback) end

---Requests finalization of the current recording, including one started through
---HTTP. Wait for `recorder.EVENT_STARTED` before calling stop for a Lua recording.
---The original start callback receives `recorder.EVENT_STOPPED` only after the
---MP4 is finalized and ready to read, or `recorder.EVENT_ERROR` on failure.
---Returns an error if no recording is active or an operation is pending.
---@return boolean|nil accepted true if accepted, otherwise nil
---@return string|nil error reason the request was rejected
---
---[Open in Browser](https://defold.com/ref/recorder-lua#recorder.stop:)
function recorder.stop() end
