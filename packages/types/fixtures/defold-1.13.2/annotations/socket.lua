--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.socket
---[LuaSocket](https://github.com/diegonehab/luasocket) is a Lua extension library that provides
---support for the TCP and UDP transport layers. Defold provides the "socket" namespace in
---runtime, which contain the core C functionality. Additional LuaSocket support modules for
---SMTP, HTTP, FTP etc are not part of the core included, but can be easily added to a project
---and used.
---
---On HTML5, the non-network helpers remain available, but TCP, UDP and
---`socket.select()` are not supported.
---
---Note the included helper module "socket.lua" in "builtins/scripts/socket.lua". Require this
---module to add some additional functions and shortcuts to the namespace:
---
---```lua
---require "builtins.scripts.socket"
---```
---
---LuaSocket is Copyright © 2004-2007 Diego Nehab. All rights reserved.
---LuaSocket is free software, released under the MIT license (same license as the Lua core).
---@field dns defold_api.socket.dns
---This constant contains the maximum number of sockets that the select function can handle.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket._SETSIZE)
---@field _SETSIZE integer
---This constant has a string describing the current LuaSocket version.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket._VERSION)
---@field _VERSION string
socket = {}

---@class defold_api.socket.dns
socket.dns = {}

---This function is a shortcut that creates and returns a TCP client object connected to a remote
---address at a given port. Optionally, the user can also specify the local address and port to
---bind (`locaddr` and `locport`), or restrict the socket family to `"inet"` or `"inet6"`.
---Without specifying family to connect, whether a tcp or tcp6 connection is created depends on
---your system configuration.
---@param address string the address to connect to.
---@param port number the port to connect to.
---@param locaddr? string optional local address to bind to.
---@param locport? number optional local port to bind to.
---@param family? string optional socket family to use, `"inet"` or `"inet6"`.
---@return socket_client|nil tcp_client a new IPv6 TCP client object, or `nil` in case of error.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.connect:address-port-locaddr-locport-family)
function socket.connect(address, port, locaddr, locport, family) end

---This function converts a host name to IPv4 or IPv6 address.
---The supplied address can be an IPv4 or IPv6 address or host name.
---
---In case of error, the function returns nil followed by an error message.
---@param address string a hostname or an IPv4 or IPv6 address.
---@return socket.dns.address_info[]|nil resolved resolver information, or `nil` on error
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.dns.getaddrinfo:address)
function socket.dns.getaddrinfo(address) end

---Returns the standard host name for the machine as a string.
---@return string hostname the host name for the machine.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.dns.gethostname:)
function socket.dns.gethostname() end

---This function converts an address to host name.
---The supplied address can be an IPv4 or IPv6 address or host name.
---
---The function returns a table with all information returned by the resolver:
---
---```lua
---{
---[1] = host-name-1,
---...
---[n] = host-name-n,
---}
---```
---@param address string a hostname or an IPv4 or IPv6 address.
---@return string[]|nil resolved a table with all information returned by the resolver, or if an error occurs, `nil`.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.dns.getnameinfo:address)
function socket.dns.getnameinfo(address) end

---This function converts from an IPv4 address to host name.
---The address can be an IPv4 address or a host name.
---@param address string an IPv4 address or host name.
---@return string|nil hostname the canonic host name of the given address, or `nil` in case of an error.
---@return socket.dns.host_info|string resolved resolver information, or an error message string
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.dns.tohostname:address)
function socket.dns.tohostname(address) end

---This function converts a host name to IPv4 address.
---The address can be an IP address or a host name.
---@param address string a hostname or an IP address.
---@return string|nil ip_address the first IP address found for the hostname, or `nil` in case of an error.
---@return socket.dns.host_info|string resolved resolver information, or an error message string
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.dns.toip:address)
function socket.dns.toip(address) end

---Returns the time in seconds, relative to the system epoch (Unix epoch time since January 1, 1970 (UTC) or Windows file time since January 1, 1601 (UTC)).
---You should use the values returned by this function for relative measurements only.
---
---**Examples:**
---
---How to use the gettime() function to measure running time:
---
---```lua
---t = socket.gettime()
----- do stuff
---print(socket.gettime() - t .. " seconds elapsed")
---```
---@return number seconds the number of seconds elapsed.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.gettime:)
function socket.gettime() end

---This function creates and returns a clean try function that allows for cleanup before the exception is raised.
---The `finalizer` function will be called in protected mode (see `protect`).
---
---**Examples:**
---
---Perform operations on an open socket `c`:
---
---```lua
----- create a try function that closes 'c' on error
---local try = socket.newtry(function() c:close() end)
----- do everything reassured c will be closed
---try(c:send("hello there?\r\n"))
---local answer = try(c:receive())
---...
---try(c:send("good bye\r\n"))
---c:close()
---```
---@param finalizer fun() a function that will be called before the try throws the exception.
---@return fun(...:any):any try the customized try function.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.newtry:finalizer)
function socket.newtry(finalizer) end

---Converts a function that throws exceptions into a safe function. This function only catches exceptions thrown by try functions. It does not catch normal Lua errors.
---
---Beware that if your function performs some illegal operation that raises an error, the protected function will catch the error and return it as a string. This is because try functions uses errors as the mechanism to throw exceptions.
---
---**Examples:**
---
---```lua
---local dostuff = socket.protect(function()
---    local try = socket.newtry()
---    local c = try(socket.connect("myserver.com", 80))
---    try = socket.newtry(function() c:close() end)
---    try(c:send("hello?\r\n"))
---    local answer = try(c:receive())
---    c:close()
---end)
---
---local n, error = dostuff()
---```
---@param func fun(...:any):any a function that calls a try function (or assert, or error) to throw exceptions.
---@return fun(...:any):any safe_func an equivalent function that instead of throwing exceptions, returns `nil` followed by an error message.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.protect:func)
function socket.protect(func) end

---The function returns a list with the sockets ready for reading, a list with the sockets ready for writing and an error message. The error message is "timeout" if a timeout condition was met and nil otherwise. The returned tables are doubly keyed both by integers and also by the sockets themselves, to simplify the test if a specific socket has changed status.
---
---`Recvt` and `sendt` parameters can be empty tables or `nil`. Non-socket values (or values with non-numeric indices) in these arrays will be silently ignored.
---
---The returned tables are doubly keyed both by integers and also by the sockets themselves, to simplify the test if a specific socket has changed status.
---
---This function can monitor a limited number of sockets, as defined by the constant socket._SETSIZE. This number may be as high as 1024 or as low as 64 by default, depending on the system. It is usually possible to change this at compile time. Invoking select with a larger number of sockets will raise an error.
---
---A known bug in WinSock causes select to fail on non-blocking TCP sockets. The function may return a socket as writable even though the socket is not ready for sending.
---
---Calling select with a server socket in the receive parameter before a call to accept does not guarantee accept will return immediately. Use the settimeout method or accept might block forever.
---
---If you close a socket and pass it to select, it will be ignored.
---
---(Using select with non-socket objects: Any object that implements `getfd` and `dirty` can be used with select, allowing objects from other libraries to be used within a socket.select driven loop.)
---@param recvt socket_selectable[] array with the sockets or compatible objects to test for characters available for reading.
---@param sendt socket_selectable[] array with sockets or compatible objects that are watched to see if it is OK to immediately write on them.
---@param timeout? number the maximum amount of time (in seconds) to wait for a change in status. Nil, negative or omitted timeout value allows the function to block indefinitely.
---@return table<integer|socket_selectable, socket_selectable|integer> sockets_r sockets ready for reading, keyed both by array index and by socket.
---@return table<integer|socket_selectable, socket_selectable|integer> sockets_w sockets ready for writing, keyed both by array index and by socket.
---@return string|nil error an error message. "timeout" if a timeout condition was met, otherwise `nil`.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.select:recvt-sendt-timeout)
function socket.select(recvt, sendt, timeout) end

---This function drops a number of arguments and returns the remaining.
---It is useful to avoid creation of dummy variables:
---`D` is the number of arguments to drop. `Ret1` to `retN` are the arguments.
---The function returns `retD+1` to `retN`.
---
---**Examples:**
---
---Instead of doing the following with dummy variables:
---
---```lua
----- get the status code and separator from SMTP server reply
---local dummy1, dummy2, code, sep = string.find(line, "^(%d%d%d)(.?)")
---```
---
---You can skip a number of variables:
---
---```lua
----- get the status code and separator from SMTP server reply
---local code, sep = socket.skip(2, string.find(line, "^(%d%d%d)(.?)"))
---```
---@param d integer the number of arguments to drop.
---@param ... any the values from which to drop arguments.
---@return ...
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.skip:d-...)
function socket.skip(d, ...) end

---Freezes the program execution during a given amount of time.
---@param time number the number of seconds to sleep for.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.sleep:time)
function socket.sleep(time) end

---Creates and returns an IPv4 TCP master object. A master object can be transformed into a server object with the method `listen` (after a call to `bind`) or into a client object with the method `connect`. The only other method supported by a master object is the `close` method.
---@return socket_master|nil tcp_master a new IPv4 TCP master object, or `nil` in case of error.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.tcp:)
function socket.tcp() end

---Creates and returns an IPv6 TCP master object. A master object can be transformed into a server object with the method `listen` (after a call to `bind`) or into a client object with the method connect. The only other method supported by a master object is the close method.
---
---Note: The TCP object returned will have the option "ipv6-v6only" set to true.
---@return socket_master|nil tcp_master a new IPv6 TCP master object, or `nil` in case of error.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.tcp6:)
function socket.tcp6() end

---Creates and returns an unconnected IPv4 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
---@return socket_unconnected|nil udp_unconnected a new unconnected IPv4 UDP object, or `nil` in case of error.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.udp:)
function socket.udp() end

---Creates and returns an unconnected IPv6 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
---
---Note: The UDP object returned will have the option "ipv6-v6only" set to true.
---@return socket_unconnected|nil udp_unconnected a new unconnected IPv6 UDP object, or `nil` in case of error.
---@return string|nil error the error message, or `nil` if no error occurred.
---
---[Open in Browser](https://defold.com/ref/socket-lua#socket.udp6:)
function socket.udp6() end
