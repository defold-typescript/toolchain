--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.sound
---Functions and messages for controlling sound components and
---mixer groups.
sound = {}

---Get mixer group gain
---
---**Examples:**
---
---Get the mixer group gain for the "soundfx" and convert to dB:
---
---```lua
---local gain = sound.get_group_gain("soundfx")
---local gain_db = 60 * gain
---```
---@param group string|hash group name
---@return number gain gain in [0 1] range ([-60dB.. 0dB])
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.get_group_gain:group)
function sound.get_group_gain(group) end

---Get a mixer group name as a string.
---
---This function is to be used for debugging and
---development tooling only. The function does a reverse hash lookup, which does not
---return a proper string value when the game is built in release mode.
---
---**Examples:**
---
---Get the mixer group string names so we can show them as labels on a dev mixer overlay:
---
---```lua
---local groups = sound.get_groups()
---for _,group in ipairs(groups) do
---    local name = sound.get_group_name(group)
---    msg.post("/mixer_overlay#gui", "set_mixer_label", { group = group, label = name})
---end
---```
---@param group string|hash group name
---@return string name group name
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.get_group_name:group)
function sound.get_group_name(group) end

---Get a table of all mixer group names (hashes).
---
---**Examples:**
---
---Get the mixer groups, set all gains to 0 except for "master" and "soundfx"
---where gain is set to 1:
---
---```lua
---local groups = sound.get_groups()
---for _,group in ipairs(groups) do
---    if group == hash("master") or group == hash("soundfx") then
---        sound.set_group_gain(group, 1)
---    else
---        sound.set_group_gain(group, 0)
---    end
---end
---```
---@return hash[] groups table of mixer group names
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.get_groups:)
function sound.get_groups() end

---Get peak value from mixer group.
---
---Note that gain is in linear scale, between 0 and 1.
---To get the dB value from the gain, use the formula `20 * log(gain)`.
---Inversely, to find the linear value from a dB value, use the formula
---`10db/20`.
---Also note that the returned value might be an approximation and in particular
---the effective window might be larger than specified.
---
---**Examples:**
---
---Get the peak gain from the "master" group and convert to dB for displaying:
---
---```lua
---local left_p, right_p = sound.get_peak("master", 0.1)
---left_p_db = 20 * log(left_p)
---right_p_db = 20 * log(right_p)
---```
---@param group string|hash group name
---@param window number window length in seconds
---@return number peak_l peak value for left channel
---@return number peak_r peak value for right channel
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.get_peak:group-window)
function sound.get_peak(group, window) end

---Get RMS (Root Mean Square) value from mixer group. This value is the
---square root of the mean (average) value of the squared function of
---the instantaneous values.
---
---For instance: for a sinewave signal with a peak gain of -1.94 dB (0.8 linear),
---the RMS is `0.8 × 1/sqrt(2)` which is about 0.566.
---
---Note the returned value might be an approximation and in particular
---the effective window might be larger than specified.
---
---**Examples:**
---
---Get the RMS from the "master" group where a mono -1.94 dB sinewave is playing:
---
---```lua
---local rms = sound.get_rms("master", 0.1) -- throw away right channel.
---print(rms) --> 0.56555819511414
---```
---@param group string|hash group name
---@param window number window length in seconds
---@return number rms_l RMS value for left channel
---@return number rms_r RMS value for right channel
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.get_rms:group-window)
function sound.get_rms(group, window) end

---Checks if background music is playing, e.g. from iTunes.
---
---On non mobile platforms,
---this function always return `false`.
---
---On Android you can only get a correct reading
---of this state if your game is not playing any sounds itself. This is a limitation
---in the Android SDK. If your game is playing any sounds, *even with a gain of zero*, this
---function will return `false`.
---
---The best time to call this function is:
---
---- In the `init` function of your main collection script before any sounds are triggered
---- In a window listener callback when the window.WINDOW_EVENT_FOCUS_GAINED event is received
---
---Both those times will give you a correct reading of the state even when your application is
---swapped out and in while playing sounds and it works equally well on Android and iOS.
---
---**Examples:**
---
---If music is playing, mute "master":
---
---```lua
---if sound.is_music_playing() then
---    -- mute "master"
---    sound.set_group_gain("master", 0)
---end
---```
---@return boolean playing `true` if music is playing, otherwise `false`.
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.is_music_playing:)
function sound.is_music_playing() end

---Checks if a phone call is active. If there is an active phone call all
---other sounds will be muted until the phone call is finished.
---
---On non mobile platforms,
---this function always return `false`.
---
---**Examples:**
---
---Test if a phone call is on-going:
---
---```lua
---if sound.is_phone_call_active() then
---    -- do something sensible.
---end
---```
---@return boolean call_active `true` if there is an active phone call, `false` otherwise.
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.is_phone_call_active:)
function sound.is_phone_call_active() end

---Pause all active voices
---
---**Examples:**
---
---Assuming the script belongs to an instance with a sound-component with id "sound", this will make the component pause all playing voices:
---
---```lua
---sound.pause("#sound", true)
---```
---@param url string|hash|url the sound that should pause
---@param pause boolean true if the sound should pause
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.pause:url-pause)
function sound.pause(url, pause) end

---Make the sound component play its sound. Multiple voices are supported. The limit is set to 32 voices per sound component.
---
---A sound will continue to play even if the game object the sound component belonged to is deleted. You can call `sound.stop()` to stop the sound.
---
---**Examples:**
---
---Assuming the script belongs to an instance with a sound-component with id "sound", this will make the component play its sound after 1 second:
---
---```lua
---sound.play("#sound", { delay = 1, gain = 0.9, pan = -1.0 } )
---```
---
---Using the callback argument, you can chain several sounds together:
---
---```lua
---local function sound_done(self, message_id, message, sender)
---  -- play 'boom' sound fx when the countdown has completed
---  if message_id == hash("sound_done") and message.play_id == self.countdown_id then
---    sound.play("#boom", nil, sound_done)
---  end
---end
---
---function init(self)
---  self.countdown_id = sound.play("#countdown", nil, sound_done)
---end
---```
---@param url string|hash|url the sound that should play
---@param play_properties? sound.play_properties optional playback properties
---@param complete_function? fun(self:script_instance, message_id:hash, message:sound.play_completion, sender:url) function to call when the sound has finished playing or stopped manually via `sound.stop`.  `self` `script_instance` The current script instance.  `message_id` `hash` The name of the completion message, which can be either `"sound_done"` if the sound has finished playing, or `"sound_stopped"` if it was stopped manually.  `message` `sound.play_completion` Information about the completed or stopped playback.  `sender` `url` The invoker of the callback: the sound component.
---@return number play_id The identifier for the sound voice
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.play:url-play_properties-complete_function)
function sound.play(url, play_properties, complete_function) end

---Set gain on all active playing voices of a sound.
---
---**Examples:**
---
---Assuming the script belongs to an instance with a sound-component with id "sound", this will set the gain to 0.9
---
---```lua
---sound.set_gain("#sound", 0.9)
---```
---@param url string|hash|url the sound to set the gain of
---@param gain? number sound gain between 0 and 1 [-60dB .. 0dB]. The final gain of the sound will be a combination of this gain, the group gain and the master gain.
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.set_gain:url-gain)
function sound.set_gain(url, gain) end

---Set mixer group gain
---
---**Examples:**
---
---Set mixer group gain on the "soundfx" group to 50% (-30dB):
---
---```lua
---sound.set_group_gain("soundfx", 0.5)
---```
---@param group string|hash group name
---@param gain number gain in range [0..1] mapped to [0 .. -60dB]
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.set_group_gain:group-gain)
function sound.set_group_gain(group, gain) end

---Set panning on all active playing voices of a sound.
---
---The valid range is from -1.0 to 1.0, representing -45 degrees left, to +45 degrees right.
---
---**Examples:**
---
---Assuming the script belongs to an instance with a sound-component with id "sound", this will set the gain to 0.5
---
---```lua
---sound.set_pan("#sound", 0.5) -- pan to the right
---```
---@param url string|hash|url the sound to set the panning value to
---@param pan? number sound panning between -1.0 and 1.0
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.set_pan:url-pan)
function sound.set_pan(url, pan) end

---Stop playing all active voices or just one voice if `play_id` provided
---
---**Examples:**
---
---Assuming the script belongs to an instance with a sound-component with id "sound", this will make the component stop all playing voices:
---
---```lua
---sound.stop("#sound")
---local id = sound.play("#sound")
---sound.stop("#sound", {play_id = id})
---```
---@param url string|hash|url the sound component that should stop
---@param stop_properties? sound.stop_properties optional playback to stop
---
---[Open in Browser](https://defold.com/ref/sound-lua#sound.stop:url-stop_properties)
function sound.stop(url, stop_properties) end
