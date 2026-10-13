--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.http
---Functions for performing HTTP and HTTPS requests.
http = {}

---Perform a HTTP/HTTPS request.
---
---If no timeout value is passed, the configuration value "network.http_timeout" is used. If that is not set, the timeout value is `0` (which blocks indefinitely).
---
---**Examples:**
---
---Basic HTTP-GET request. The callback receives a table with the response
---in the fields status, the response (the data) and headers (a table).
---
---```lua
---local function http_result(self, _, response)
---    if response.bytes_total ~= nil then
---        update_my_progress_bar(self, response.bytes_received / response.bytes_total)
---    else
---        print(response.status)
---        print(response.response)
---        pprint(response.headers)
---    end
---end
---
---function init(self)
---    http.request("http://www.google.com", "GET", http_result, nil, nil, { report_progress = true })
---end
---```
---@param url string target url
---@param method string HTTP/HTTPS method, e.g. "GET", "PUT", "POST" etc.
---@param callback fun(self:script_instance, id:hash, response:http.response) response callback function  `self` `script_instance` The current script instance  `id` `hash` Internal message identifier. Do not use!
---@param headers? table<string, string> optional table with custom headers
---@param post_data? string optional data to send
---@param options? http.request_options optional request options
---
---[Open in Browser](https://defold.com/ref/http-lua#http.request:url-method-callback-headers-post_data-options)
function http.request(url, method, callback, headers, post_data, options) end
