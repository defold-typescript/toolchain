--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.msg
---Functions for passing messages and constructing URL objects.
msg = {}

---Post a message to a receiving URL. The most common case is to send messages
---to a component. If the component part of the receiver is omitted, the message
---is broadcast to all components in the game object.
---
---The following receiver shorthands are available:
---
---- `"."` the current game object
---- `"#"` the current component
---
---There is a 2 kilobyte limit to the message parameter table size.
---
---**Examples:**
---
---Send "enable" to the sprite "my_sprite" in "my_gameobject":
---
---```lua
---msg.post("my_gameobject#my_sprite", "enable")
---```
---
---Send a "my_message" to an url with some additional data:
---
---```lua
---local params = {my_parameter = "my_value"}
---msg.post(my_url, "my_message", params)
---```
---@param receiver string|url|hash The receiver must be a string in URL-format, a URL object or a hashed string.
---@param message_id string|hash The id must be a string or a hashed string.
---@param message? table<any, any>|nil a lua table with message parameters to send.
---
---[Open in Browser](https://defold.com/ref/msg-lua#msg.post:receiver-message_id-message)
function msg.post(receiver, message_id, message) end

---This is equivalent to `msg.url(nil)` or `msg.url("#")`, which creates an url to the current
---script component.
---
---**Examples:**
---
---Create a new URL which will address the current script:
---
---```lua
---local my_url = msg.url()
---print(my_url) --> url: [current_collection:/my_instance#my_component]
---```
---
---```lua
---local my_url = msg.url("#my_component")
---print(my_url) --> url: [current_collection:/my_instance#my_component]
---
---local my_url = msg.url("my_collection:/my_sub_collection/my_instance#my_component")
---print(my_url) --> url: [my_collection:/my_sub_collection/my_instance#my_component]
---
---local my_url = msg.url("my_socket:")
---print(my_url) --> url: [my_collection:]
---```
---
---```lua
---local my_socket = "main" -- specify by valid name
---local my_path = hash("/my_collection/my_gameobject") -- specify as string or hash
---local my_fragment = "component" -- specify as string or hash
---local my_url = msg.url(my_socket, my_path, my_fragment)
---
---print(my_url) --> url: [main:/my_collection/my_gameobject#component]
---print(my_url.socket) --> 786443 (internal numeric value)
---print(my_url.path) --> hash: [/my_collection/my_gameobject]
---print(my_url.fragment) --> hash: [component]
---```
---@overload fun(urlstring:string):url
---@overload fun(socket?:string|hash, path?:string|hash, fragment?:string|hash):url
---@return url url a new URL
---
---[Open in Browser](https://defold.com/ref/msg-lua#msg.url:)
function msg.url() end
