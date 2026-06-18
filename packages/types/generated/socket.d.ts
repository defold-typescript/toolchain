/** @noSelfInFile */
declare global {
  /**
   * [LuaSocket](https://github.com/diegonehab/luasocket) is a Lua extension library that provides
   * support for the TCP and UDP transport layers. Defold provides the "socket" namespace in
   * runtime, which contain the core C functionality. Additional LuaSocket support modules for
   * SMTP, HTTP, FTP etc are not part of the core included, but can be easily added to a project
   * and used.
   *
   * [icon:html5] On HTML5, the non-network helpers remain available, but TCP, UDP and
   * `socket.select()` are not supported.
   *
   * Note the included helper module "socket.lua" in "builtins/scripts/socket.lua". Require this
   * module to add some additional functions and shortcuts to the namespace:
   *
   * ```lua
   * require "builtins.scripts.socket"
   * ```
   *
   * LuaSocket is Copyright &copy; 2004-2007 Diego Nehab. All rights reserved.
   * LuaSocket is free software, released under the MIT license (same license as the Lua core).
   */
  namespace socket {
    interface client {
      /**
       * Closes the TCP object. The internal socket used by the object is closed and the local address to which the object was bound is made available to other applications. No further operations (except for further calls to the close method) are allowed on a closed socket.
       * It is important to close all used sockets once they are not needed, since, in many systems, each socket uses a file descriptor, which are limited system resources. Garbage-collected objects are automatically closed before destruction, though.
       */
      close(): void;
      /**
       * Check the read buffer status.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns `true` if there is any data in the read buffer, `false` otherwise.
       */
      dirty(): boolean;
      /**
       * Returns the underlying socket descriptor or handle associated to the object.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns the descriptor or handle. In case the object has been closed, the return will be -1.
       */
      getfd(): number;
      /**
       * Gets options for the TCP object. See client:setoption for description of the option names and values.
       *
       * @param option - the name of the option to get:
       *
       * - `"keepalive"`
       *
       * - `"linger"`
       *
       * - `"reuseaddr"`
       *
       * - `"tcp-nodelay"`
       */
      getoption(option: string): LuaMultiReturn<[unknown, string | unknown]>;
      /**
       * Returns information about the remote side of a connected client object.
       * It makes no sense to call this method on server objects.
       *
       * @returns a string with the IP address of the peer, the port number that peer is using for the connection, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getpeername(): string;
      /**
       * Returns the local address information associated to the object.
       *
       * @returns a string with local IP address, the local port number, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getsockname(): string;
      /**
       * Returns accounting information on the socket, useful for throttling of bandwidth.
       *
       * @returns a string with the number of bytes received, the number of bytes sent, and the age of the socket object in seconds.
       */
      getstats(): string;
      /**
       * Reads data from a client object, according to the specified `read pattern`. Patterns follow the Lua file I/O format, and the difference in performance between patterns is negligible.
       *
       * @param pattern - the read pattern that can be any of the following:
       *
       * `"*a"`
       * reads from the socket until the connection is closed. No end-of-line translation is performed;
       * `"*l"`
       * reads a line of text from the socket. The line is terminated by a LF character (ASCII 10), optionally preceded by a CR character (ASCII 13). The CR and LF characters are not included in the returned line. In fact, all CR characters are ignored by the pattern. This is the default pattern;
       * `number`
       * causes the method to read a specified number of bytes from the socket.
       * @param prefix - an optional string to be concatenated to the beginning of any received data before return.
       */
      receive(pattern?: string | number, prefix?: string): LuaMultiReturn<[string | unknown, string | unknown, string | unknown]>;
      /**
       * Sends data through client object.
       * The optional arguments i and j work exactly like the standard string.sub Lua function to allow the selection of a substring to be sent.
       * Output is not buffered. For small strings, it is always better to concatenate them in Lua (with the `..` operator) and send the result in one call instead of calling the method several times.
       *
       * @param data - the string to be sent.
       * @param i - optional starting index of the string.
       * @param j - optional end index of string.
       */
      send(data: string, i?: number, j?: number): LuaMultiReturn<[number | unknown, string | unknown, number | unknown]>;
      /**
       * Sets the underling socket descriptor or handle associated to the object. The current one is simply replaced, not closed, and no other change to the object state is made
       *
       * @param handle - the descriptor or handle to set.
       */
      setfd(handle: number): void;
      /**
       * Sets options for the TCP object. Options are only needed by low-level or time-critical applications. You should only modify an option if you are sure you need it.
       *
       * @param option - the name of the option to set. The value is provided in the `value` parameter:
       *
       * `"keepalive"`
       * Setting this option to `true` enables the periodic transmission of messages on a connected socket. Should the connected party fail to respond to these messages, the connection is considered broken and processes using the socket are notified;
       * `"linger"`
       * Controls the action taken when unsent data are queued on a socket and a close is performed. The value is a table with the following keys:
       *
       * - boolean `on`
       *
       * - number `timeout` (seconds)
       *
       * If the 'on' field is set to true, the system will block the process on the close attempt until it is able to transmit the data or until `timeout` has passed. If 'on' is false and a close is issued, the system will process the close in a manner that allows the process to continue as quickly as possible. It is not advised to set this to anything other than zero;
       *
       * `"reuseaddr"`
       * Setting this option indicates that the rules used in validating addresses supplied in a call to `bind` should allow reuse of local addresses;
       * `"tcp-nodelay"`
       * Setting this option to `true` disables the Nagle's algorithm for the connection;
       * `"ipv6-v6only"`
       * Setting this option to `true` restricts an inet6 socket to sending and receiving only IPv6 packets.
       * @param value - the value to set for the specified option.
       */
      setoption(option: string, value?: unknown): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Resets accounting information on the socket, useful for throttling of bandwidth.
       *
       * @param received - the new number of bytes received.
       * @param sent - the new number of bytes sent.
       * @param age - the new age in seconds.
       * @returns the value `1` in case of success, or `nil` in case of error.
       */
      setstats(received: number, sent: number, age: number): number | unknown;
      /**
       * Changes the timeout values for the object. By default, all I/O operations are blocking. That is, any call to the methods `send`, `receive`, and `accept` will block indefinitely, until the operation completes. The `settimeout` method defines a limit on the amount of time the I/O methods can block. When a timeout is set and the specified amount of time has elapsed, the affected methods give up and fail with an error code.
       * There are two timeout modes and both can be used together for fine tuning.
       * Although timeout values have millisecond precision in LuaSocket, large blocks can cause I/O functions not to respect timeout values due to the time the library takes to transfer blocks to and from the OS and to and from the Lua interpreter. Also, function that accept host names and perform automatic name resolution might be blocked by the resolver for longer than the specified timeout value.
       *
       * @param value - the amount of time to wait, in seconds. The `nil` timeout value allows operations to block indefinitely. Negative timeout values have the same effect.
       * @param mode - optional timeout mode to set:
       *
       * `"b"`
       * block timeout. Specifies the upper limit on the amount of time LuaSocket can be blocked by the operating system while waiting for completion of any single I/O operation. This is the default mode;
       * `"t"`
       * total timeout. Specifies the upper limit on the amount of time LuaSocket can block a Lua script before returning from a call.
       */
      settimeout(value: number, mode?: string): void;
      /**
       * Shuts down part of a full-duplex connection.
       *
       * @param mode - which way of the connection should be shut down:
       *
       * `"both"`
       * disallow further sends and receives on the object. This is the default mode;
       * `"send"`
       * disallow further sends on the object;
       * `"receive"`
       * disallow further receives on the object.
       * @returns the value `1`.
       */
      shutdown(mode: string): number;
    }
    interface connected {
      /**
       * Closes a UDP object. The internal socket used by the object is closed and the local address to which the object was bound is made available to other applications. No further operations (except for further calls to the close method) are allowed on a closed socket.
       * It is important to close all used sockets once they are not needed, since, in many systems, each socket uses a file descriptor, which are limited system resources. Garbage-collected objects are automatically closed before destruction, though.
       */
      close(): void;
      /**
       * Gets an option value from the UDP object. See connected:setoption for description of the option names and values.
       *
       * @param option - the name of the option to get:
       *
       * - `"dontroute"`
       *
       * - `"broadcast"`
       *
       * - `"reuseaddr"`
       *
       * - `"reuseport"`
       *
       * - `"ip-multicast-loop"`
       *
       * - `"ipv6-v6only"`
       *
       * - `"ip-multicast-if"`
       *
       * - `"ip-multicast-ttl"`
       *
       * - `"ip-add-membership"`
       *
       * - `"ip-drop-membership"`
       */
      getoption(option: string): LuaMultiReturn<[unknown, string | unknown]>;
      /**
       * Retrieves information about the peer associated with a connected UDP object.
       * It makes no sense to call this method on unconnected objects.
       *
       * @returns a string with the IP address of the peer, the port number that peer is using for the connection, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getpeername(): string;
      /**
       * Returns the local address information associated to the object.
       * UDP sockets are not bound to any address until the `setsockname` or the `sendto` method is called for the first time (in which case it is bound to an ephemeral port and the wild-card address).
       *
       * @returns a string with local IP address, a number with the local port, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getsockname(): string;
      /**
       * Receives a datagram from the UDP object. If the UDP object is connected, only datagrams coming from the peer are accepted. Otherwise, the returned datagram can come from any host.
       *
       * @param size - optional maximum size of the datagram to be retrieved. If there are more than size bytes available in the datagram, the excess bytes are discarded. If there are less then size bytes available in the current datagram, the available bytes are returned. If size is omitted, the maximum datagram size is used (which is currently limited by the implementation to 8192 bytes).
       */
      receive(size?: number): LuaMultiReturn<[string | unknown, string | unknown]>;
      /**
       * Sends a datagram to the UDP peer of a connected object.
       * In UDP, the send method never blocks and the only way it can fail is if the underlying transport layer refuses to send a message to the specified address (i.e. no interface accepts the address).
       *
       * @param datagram - a string with the datagram contents. The maximum datagram size for UDP is 64K minus IP layer overhead. However datagrams larger than the link layer packet size will be fragmented, which may deteriorate performance and/or reliability.
       */
      send(datagram: string): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Sets options for the UDP object. Options are only needed by low-level or time-critical applications. You should only modify an option if you are sure you need it.
       *
       * @param option - the name of the option to set. The value is provided in the `value` parameter:
       *
       * `"dontroute"`
       * Indicates that outgoing messages should bypass the standard routing facilities. Receives a boolean value;
       * `"broadcast"`
       * Requests permission to send broadcast datagrams on the socket. Receives a boolean value;
       * `"reuseaddr"`
       * Indicates that the rules used in validating addresses supplied in a `bind` call should allow reuse of local addresses. Receives a boolean value;
       * `"reuseport"`
       * Allows completely duplicate bindings by multiple processes if they all set `"reuseport"` before binding the port. Receives a boolean value;
       * `"ip-multicast-loop"`
       * Specifies whether or not a copy of an outgoing multicast datagram is delivered to the sending host as long as it is a member of the multicast group. Receives a boolean value;
       * `"ipv6-v6only"`
       * Specifies whether to restrict inet6 sockets to sending and receiving only IPv6 packets. Receive a boolean value;
       * `"ip-multicast-if"`
       * Sets the interface over which outgoing multicast datagrams are sent. Receives an IP address;
       * `"ip-multicast-ttl"`
       * Sets the Time To Live in the IP header for outgoing multicast datagrams. Receives a number;
       *
       * `"ip-add-membership"`: Joins the multicast group specified. Receives a table with fields:
       *
       * - string `multiaddr` (IP address)
       *
       * - string `interface` (IP address)
       *
       * "'ip-drop-membership"`
       * Leaves the multicast group specified. Receives a table with fields:
       *
       * - string `multiaddr` (IP address)
       *
       * - string `interface` (IP address)
       * @param value - the value to set for the specified option.
       */
      setoption(option: string, value?: unknown): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Changes the peer of a UDP object. This method turns an unconnected UDP object into a connected UDP object or vice versa.
       * For connected objects, outgoing datagrams will be sent to the specified peer, and datagrams received from other peers will be discarded by the OS. Connected UDP objects must use the `send` and `receive` methods instead of `sendto` and `receivefrom`.
       * Since the address of the peer does not have to be passed to and from the OS, the use of connected UDP objects is recommended when the same peer is used for several transmissions and can result in up to 30% performance gains.
       *
       * @param arg0 - if address is "*" and the object is connected, the peer association is removed and the object becomes an unconnected object again.
       */
      setpeername(arg0: string): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Changes the timeout values for the object. By default, the `receive` and `receivefrom` operations are blocking. That is, any call to the methods will block indefinitely, until data arrives. The `settimeout` function defines a limit on the amount of time the functions can block. When a timeout is set and the specified amount of time has elapsed, the affected methods give up and fail with an error code.
       * In UDP, the `send` and `sendto` methods never block (the datagram is just passed to the OS and the call returns immediately). Therefore, the `settimeout` method has no effect on them.
       *
       * @param value - the amount of time to wait, in seconds. The `nil` timeout value allows operations to block indefinitely. Negative timeout values have the same effect.
       */
      settimeout(value: number): void;
    }
    interface master {
      /**
       * Binds a master object to address and port on the local host.
       *
       * @param address - an IP address or a host name. If address is `"*"`, the system binds to all local interfaces using the `INADDR_ANY` constant.
       * @param port - the port to commect to, in the range [0..64K). If port is 0, the system automatically chooses an ephemeral port.
       */
      bind(address: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Closes the TCP object. The internal socket used by the object is closed and the local address to which the object was bound is made available to other applications. No further operations (except for further calls to the close method) are allowed on a closed socket.
       * It is important to close all used sockets once they are not needed, since, in many systems, each socket uses a file descriptor, which are limited system resources. Garbage-collected objects are automatically closed before destruction, though.
       */
      close(): void;
      /**
       * Attempts to connect a master object to a remote host, transforming it into a client object. Client objects support methods send, receive, getsockname, getpeername, settimeout, and close.
       * Note that the function `socket.connect` is available and is a shortcut for the creation of client sockets.
       *
       * @param address - an IP address or a host name. If address is `"*"`, the system binds to all local interfaces using the `INADDR_ANY` constant.
       * @param port - the port to commect to, in the range [0..64K). If port is 0, the system automatically chooses an ephemeral port.
       */
      connect(address: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Check the read buffer status.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns `true` if there is any data in the read buffer, `false` otherwise.
       */
      dirty(): boolean;
      /**
       * Returns the underlying socket descriptor or handle associated to the object.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns the descriptor or handle. In case the object has been closed, the return will be -1.
       */
      getfd(): number;
      /**
       * Returns the local address information associated to the object.
       *
       * @returns a string with local IP address, the local port number, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getsockname(): string;
      /**
       * Returns accounting information on the socket, useful for throttling of bandwidth.
       *
       * @returns a string with the number of bytes received, the number of bytes sent, and the age of the socket object in seconds.
       */
      getstats(): string;
      /**
       * Specifies the socket is willing to receive connections, transforming the object into a server object. Server objects support the `accept`, `getsockname`, `setoption`, `settimeout`, and `close` methods.
       *
       * @param backlog - the number of client connections that can be queued waiting for service. If the queue is full and another client attempts connection, the connection is refused.
       */
      listen(backlog: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Sets the underling socket descriptor or handle associated to the object. The current one is simply replaced, not closed, and no other change to the object state is made
       *
       * @param handle - the descriptor or handle to set.
       */
      setfd(handle: number): void;
      /**
       * Resets accounting information on the socket, useful for throttling of bandwidth.
       *
       * @param received - the new number of bytes received.
       * @param sent - the new number of bytes sent.
       * @param age - the new age in seconds.
       * @returns the value `1` in case of success, or `nil` in case of error.
       */
      setstats(received: number, sent: number, age: number): number | unknown;
      /**
       * Changes the timeout values for the object. By default, all I/O operations are blocking. That is, any call to the methods `send`, `receive`, and `accept` will block indefinitely, until the operation completes. The `settimeout` method defines a limit on the amount of time the I/O methods can block. When a timeout is set and the specified amount of time has elapsed, the affected methods give up and fail with an error code.
       * There are two timeout modes and both can be used together for fine tuning.
       * Although timeout values have millisecond precision in LuaSocket, large blocks can cause I/O functions not to respect timeout values due to the time the library takes to transfer blocks to and from the OS and to and from the Lua interpreter. Also, function that accept host names and perform automatic name resolution might be blocked by the resolver for longer than the specified timeout value.
       *
       * @param value - the amount of time to wait, in seconds. The `nil` timeout value allows operations to block indefinitely. Negative timeout values have the same effect.
       * @param mode - optional timeout mode to set:
       *
       * `"b"`
       * block timeout. Specifies the upper limit on the amount of time LuaSocket can be blocked by the operating system while waiting for completion of any single I/O operation. This is the default mode;
       * `"t"`
       * total timeout. Specifies the upper limit on the amount of time LuaSocket can block a Lua script before returning from a call.
       */
      settimeout(value: number, mode?: string): void;
    }
    interface server {
      /**
       * Waits for a remote connection on the server object and returns a client object representing that connection.
       * Calling `socket.select` with a server object in the `recvt` parameter before a call to accept does not guarantee accept will return immediately. Use the `settimeout` method or accept might block until another client shows up.
       */
      accept(): LuaMultiReturn<[client | unknown, string | unknown]>;
      /**
       * Closes the TCP object. The internal socket used by the object is closed and the local address to which the object was bound is made available to other applications. No further operations (except for further calls to the close method) are allowed on a closed socket.
       * It is important to close all used sockets once they are not needed, since, in many systems, each socket uses a file descriptor, which are limited system resources. Garbage-collected objects are automatically closed before destruction, though.
       */
      close(): void;
      /**
       * Check the read buffer status.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns `true` if there is any data in the read buffer, `false` otherwise.
       */
      dirty(): boolean;
      /**
       * Returns the underlying socket descriptor or handle associated to the object.
       * This is an internal method, any use is unlikely to be portable.
       *
       * @returns the descriptor or handle. In case the object has been closed, the return will be -1.
       */
      getfd(): number;
      /**
       * Gets options for the TCP object. See server:setoption for description of the option names and values.
       *
       * @param option - the name of the option to get:
       *
       * - `"keepalive"`
       *
       * - `"linger"`
       *
       * - `"reuseaddr"`
       *
       * - `"tcp-nodelay"`
       */
      getoption(option: string): LuaMultiReturn<[unknown, string | unknown]>;
      /**
       * Returns the local address information associated to the object.
       *
       * @returns a string with local IP address, the local port number, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getsockname(): string;
      /**
       * Returns accounting information on the socket, useful for throttling of bandwidth.
       *
       * @returns a string with the number of bytes received, the number of bytes sent, and the age of the socket object in seconds.
       */
      getstats(): string;
      /**
       * Sets the underling socket descriptor or handle associated to the object. The current one is simply replaced, not closed, and no other change to the object state is made
       *
       * @param handle - the descriptor or handle to set.
       */
      setfd(handle: number): void;
      /**
       * Sets options for the TCP object. Options are only needed by low-level or time-critical applications. You should only modify an option if you are sure you need it.
       *
       * @param option - the name of the option to set. The value is provided in the `value` parameter:
       *
       * `"keepalive"`
       * Setting this option to `true` enables the periodic transmission of messages on a connected socket. Should the connected party fail to respond to these messages, the connection is considered broken and processes using the socket are notified;
       * `"linger"`
       * Controls the action taken when unsent data are queued on a socket and a close is performed. The value is a table with the following keys:
       *
       * - boolean `on`
       *
       * - number `timeout` (seconds)
       *
       * If the 'on' field is set to true, the system will block the process on the close attempt until it is able to transmit the data or until `timeout` has passed. If 'on' is false and a close is issued, the system will process the close in a manner that allows the process to continue as quickly as possible. It is not advised to set this to anything other than zero;
       *
       * `"reuseaddr"`
       * Setting this option indicates that the rules used in validating addresses supplied in a call to `bind` should allow reuse of local addresses;
       * `"tcp-nodelay"`
       * Setting this option to `true` disables the Nagle's algorithm for the connection;
       * `"ipv6-v6only"`
       * Setting this option to `true` restricts an inet6 socket to sending and receiving only IPv6 packets.
       * @param value - the value to set for the specified option.
       */
      setoption(option: string, value?: unknown): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Resets accounting information on the socket, useful for throttling of bandwidth.
       *
       * @param received - the new number of bytes received.
       * @param sent - the new number of bytes sent.
       * @param age - the new age in seconds.
       * @returns the value `1` in case of success, or `nil` in case of error.
       */
      setstats(received: number, sent: number, age: number): number | unknown;
      /**
       * Changes the timeout values for the object. By default, all I/O operations are blocking. That is, any call to the methods `send`, `receive`, and `accept` will block indefinitely, until the operation completes. The `settimeout` method defines a limit on the amount of time the I/O methods can block. When a timeout is set and the specified amount of time has elapsed, the affected methods give up and fail with an error code.
       * There are two timeout modes and both can be used together for fine tuning.
       * Although timeout values have millisecond precision in LuaSocket, large blocks can cause I/O functions not to respect timeout values due to the time the library takes to transfer blocks to and from the OS and to and from the Lua interpreter. Also, function that accept host names and perform automatic name resolution might be blocked by the resolver for longer than the specified timeout value.
       *
       * @param value - the amount of time to wait, in seconds. The `nil` timeout value allows operations to block indefinitely. Negative timeout values have the same effect.
       * @param mode - optional timeout mode to set:
       *
       * `"b"`
       * block timeout. Specifies the upper limit on the amount of time LuaSocket can be blocked by the operating system while waiting for completion of any single I/O operation. This is the default mode;
       * `"t"`
       * total timeout. Specifies the upper limit on the amount of time LuaSocket can block a Lua script before returning from a call.
       */
      settimeout(value: number, mode?: string): void;
    }
    interface unconnected {
      /**
       * Closes a UDP object. The internal socket used by the object is closed and the local address to which the object was bound is made available to other applications. No further operations (except for further calls to the close method) are allowed on a closed socket.
       * It is important to close all used sockets once they are not needed, since, in many systems, each socket uses a file descriptor, which are limited system resources. Garbage-collected objects are automatically closed before destruction, though.
       */
      close(): void;
      /**
       * Gets an option value from the UDP object. See unconnected:setoption for description of the option names and values.
       *
       * @param option - the name of the option to get:
       *
       * - `"dontroute"`
       *
       * - `"broadcast"`
       *
       * - `"reuseaddr"`
       *
       * - `"reuseport"`
       *
       * - `"ip-multicast-loop"`
       *
       * - `"ipv6-v6only"`
       *
       * - `"ip-multicast-if"`
       *
       * - `"ip-multicast-ttl"`
       *
       * - `"ip-add-membership"`
       *
       * - `"ip-drop-membership"`
       */
      getoption(option: string): LuaMultiReturn<[unknown, string | unknown]>;
      /**
       * Returns the local address information associated to the object.
       * UDP sockets are not bound to any address until the `setsockname` or the `sendto` method is called for the first time (in which case it is bound to an ephemeral port and the wild-card address).
       *
       * @returns a string with local IP address, a number with the local port, and the family ("inet" or "inet6"). In case of error, the method returns `nil`.
       */
      getsockname(): string;
      /**
       * Receives a datagram from the UDP object. If the UDP object is connected, only datagrams coming from the peer are accepted. Otherwise, the returned datagram can come from any host.
       *
       * @param size - optional maximum size of the datagram to be retrieved. If there are more than size bytes available in the datagram, the excess bytes are discarded. If there are less then size bytes available in the current datagram, the available bytes are returned. If size is omitted, the maximum datagram size is used (which is currently limited by the implementation to 8192 bytes).
       */
      receive(size?: number): LuaMultiReturn<[string | unknown, string | unknown]>;
      /**
       * Works exactly as the receive method, except it returns the IP address and port as extra return values (and is therefore slightly less efficient).
       *
       * @param size - optional maximum size of the datagram to be retrieved.
       */
      receivefrom(size?: number): LuaMultiReturn<[string | unknown, string, number | unknown]>;
      /**
       * Sends a datagram to the specified IP address and port number.
       * In UDP, the send method never blocks and the only way it can fail is if the underlying transport layer refuses to send a message to the specified address (i.e. no interface accepts the address).
       *
       * @param datagram - a string with the datagram contents. The maximum datagram size for UDP is 64K minus IP layer overhead. However datagrams larger than the link layer packet size will be fragmented, which may deteriorate performance and/or reliability.
       * @param ip - the IP address of the recipient. Host names are not allowed for performance reasons.
       * @param port - the port number at the recipient.
       */
      sendto(datagram: string, ip: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Sets options for the UDP object. Options are only needed by low-level or time-critical applications. You should only modify an option if you are sure you need it.
       *
       * @param option - the name of the option to set. The value is provided in the `value` parameter:
       *
       * `"dontroute"`
       * Indicates that outgoing messages should bypass the standard routing facilities. Receives a boolean value;
       * `"broadcast"`
       * Requests permission to send broadcast datagrams on the socket. Receives a boolean value;
       * `"reuseaddr"`
       * Indicates that the rules used in validating addresses supplied in a `bind` call should allow reuse of local addresses. Receives a boolean value;
       * `"reuseport"`
       * Allows completely duplicate bindings by multiple processes if they all set `"reuseport"` before binding the port. Receives a boolean value;
       * `"ip-multicast-loop"`
       * Specifies whether or not a copy of an outgoing multicast datagram is delivered to the sending host as long as it is a member of the multicast group. Receives a boolean value;
       * `"ipv6-v6only"`
       * Specifies whether to restrict inet6 sockets to sending and receiving only IPv6 packets. Receive a boolean value;
       * `"ip-multicast-if"`
       * Sets the interface over which outgoing multicast datagrams are sent. Receives an IP address;
       * `"ip-multicast-ttl"`
       * Sets the Time To Live in the IP header for outgoing multicast datagrams. Receives a number;
       *
       * `"ip-add-membership"`: Joins the multicast group specified. Receives a table with fields:
       *
       * - string `multiaddr` (IP address)
       *
       * - string `interface` (IP address)
       *
       * "'ip-drop-membership"`
       * Leaves the multicast group specified. Receives a table with fields:
       *
       * - string `multiaddr` (IP address)
       *
       * - string `interface` (IP address)
       * @param value - the value to set for the specified option.
       */
      setoption(option: string, value?: unknown): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Changes the peer of a UDP object. This method turns an unconnected UDP object into a connected UDP object or vice versa.
       * For connected objects, outgoing datagrams will be sent to the specified peer, and datagrams received from other peers will be discarded by the OS. Connected UDP objects must use the `send` and `receive` methods instead of `sendto` and `receivefrom`.
       * Since the address of the peer does not have to be passed to and from the OS, the use of connected UDP objects is recommended when the same peer is used for several transmissions and can result in up to 30% performance gains.
       *
       * @param address - an IP address or a host name.
       * @param port - the port number.
       */
      setpeername(address: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Binds the UDP object to a local address.
       * This method can only be called before any datagram is sent through the UDP object, and only once. Otherwise, the system automatically binds the object to all local interfaces and chooses an ephemeral port as soon as the first datagram is sent. After the local address is set, either automatically by the system or explicitly by `setsockname`, it cannot be changed.
       *
       * @param address - an IP address or a host name. If address is "*" the system binds to all local interfaces using the constant `INADDR_ANY`.
       * @param port - the port number. If port is 0, the system chooses an ephemeral port.
       */
      setsockname(address: string, port: number): LuaMultiReturn<[number | unknown, string | unknown]>;
      /**
       * Changes the timeout values for the object. By default, the `receive` and `receivefrom` operations are blocking. That is, any call to the methods will block indefinitely, until data arrives. The `settimeout` function defines a limit on the amount of time the functions can block. When a timeout is set and the specified amount of time has elapsed, the affected methods give up and fail with an error code.
       * In UDP, the `send` and `sendto` methods never block (the datagram is just passed to the OS and the call returns immediately). Therefore, the `settimeout` method has no effect on them.
       *
       * @param value - the amount of time to wait, in seconds. The `nil` timeout value allows operations to block indefinitely. Negative timeout values have the same effect.
       */
      settimeout(value: number): void;
    }
    /**
     * This constant contains the maximum number of sockets that the select function can handle.
     */
    const _SETSIZE: number & { readonly __brand: "socket._SETSIZE" };
    /**
     * This constant has a string describing the current LuaSocket version.
     */
    const _VERSION: number & { readonly __brand: "socket._VERSION" };
    /**
     * This function is a shortcut that creates and returns a TCP client object connected to a remote
     * address at a given port. Optionally, the user can also specify the local address and port to
     * bind (`locaddr` and `locport`), or restrict the socket family to `"inet"` or `"inet6"`.
     * Without specifying family to connect, whether a tcp or tcp6 connection is created depends on
     * your system configuration.
     *
     * @param address - the address to connect to.
     * @param port - the port to connect to.
     * @param locaddr - optional local address to bind to.
     * @param locport - optional local port to bind to.
     * @param family - optional socket family to use, `"inet"` or `"inet6"`.
     */
    function connect(address: string, port: number, locaddr?: string, locport?: number, family?: string): LuaMultiReturn<[client | unknown, string | unknown]>;
    /**
     * Returns the time in seconds, relative to the system epoch (Unix epoch time since January 1, 1970 (UTC) or Windows file time since January 1, 1601 (UTC)).
     * You should use the values returned by this function for relative measurements only.
     *
     * @returns the number of seconds elapsed.
     * @example
     * ```ts
     * // How to use the gettime() function to measure running time:
     * const t = socket.gettime();
     * // do stuff
     * print(`${socket.gettime() - t} seconds elapsed`);
     * ```
     */
    function gettime(): number;
    /**
     * This function creates and returns a clean try function that allows for cleanup before the exception is raised.
     * The `finalizer` function will be called in protected mode (see protect).
     *
     * @param finalizer - a function that will be called before the try throws the exception.
     * @returns the customized try function.
     * @example
     * ```ts
     * // Perform operations on an open socket c:
     * // create a try function that closes 'c' on error
     * const try_ = socket.newtry(() => c.close());
     * // do everything reassured c will be closed
     * try_(c.send("hello there?\r\n"));
     * const answer = try_(c.receive());
     * // ...
     * try_(c.send("good bye\r\n"));
     * c.close();
     * ```
     */
    function newtry(finalizer: () => void): (...args: unknown[]) => unknown;
    /**
     * Converts a function that throws exceptions into a safe function. This function only catches exceptions thrown by try functions. It does not catch normal Lua errors.
     * Beware that if your function performs some illegal operation that raises an error, the protected function will catch the error and return it as a string. This is because try functions uses errors as the mechanism to throw exceptions.
     *
     * @param func - a function that calls a try function (or assert, or error) to throw exceptions.
     * @returns an equivalent function that instead of throwing exceptions, returns `nil` followed by an error message.
     * @example
     * ```ts
     * const dostuff = socket.protect(() => {
     *   let try_ = socket.newtry();
     *   const c = try_(socket.connect("myserver.com", 80));
     *   try_ = socket.newtry(() => c.close());
     *   try_(c.send("hello?\r\n"));
     *   const answer = try_(c.receive());
     *   c.close();
     * });
     *
     * const [n, error] = dostuff();
     * ```
     */
    function protect(func: (...args: unknown[]) => unknown): (arg0: unknown) => void;
    /**
     * The function returns a list with the sockets ready for reading, a list with the sockets ready for writing and an error message. The error message is "timeout" if a timeout condition was met and nil otherwise. The returned tables are doubly keyed both by integers and also by the sockets themselves, to simplify the test if a specific socket has changed status.
     * `Recvt` and `sendt` parameters can be empty tables or `nil`. Non-socket values (or values with non-numeric indices) in these arrays will be silently ignored.
     * The returned tables are doubly keyed both by integers and also by the sockets themselves, to simplify the test if a specific socket has changed status.
     * This function can monitor a limited number of sockets, as defined by the constant socket._SETSIZE. This number may be as high as 1024 or as low as 64 by default, depending on the system. It is usually possible to change this at compile time. Invoking select with a larger number of sockets will raise an error.
     * A known bug in WinSock causes select to fail on non-blocking TCP sockets. The function may return a socket as writable even though the socket is not ready for sending.
     * Calling select with a server socket in the receive parameter before a call to accept does not guarantee accept will return immediately. Use the settimeout method or accept might block forever.
     * If you close a socket and pass it to select, it will be ignored.
     * (Using select with non-socket objects: Any object that implements `getfd` and `dirty` can be used with select, allowing objects from other libraries to be used within a socket.select driven loop.)
     *
     * @param recvt - array with the sockets to test for characters available for reading.
     * @param sendt - array with sockets that are watched to see if it is OK to immediately write on them.
     * @param timeout - the maximum amount of time (in seconds) to wait for a change in status. Nil, negative or omitted timeout value allows the function to block indefinitely.
     */
    function select(recvt: (client | master | unconnected)[], sendt: (client | master | unconnected)[], timeout?: number): LuaMultiReturn<[(client | master | unconnected)[], (client | master | unconnected)[], string | unknown]>;
    /**
     * This function drops a number of arguments and returns the remaining.
     * It is useful to avoid creation of dummy variables:
     * `D` is the number of arguments to drop. `Ret1` to `retN` are the arguments.
     * The function returns `retD+1` to `retN`.
     *
     * @param d - the number of arguments to drop.
     * @param ret1 - argument 1.
     * @param ret2 - argument 2.
     * @param retN - argument N.
     * @example
     * ```ts
     * // Instead of doing the following with dummy variables:
     * // get the status code and separator from SMTP server reply
     * const [dummy1, dummy2, code, sep] = string.find(line, "^(%d%d%d)(.?)");
     *
     * // You can skip a number of variables:
     * // get the status code and separator from SMTP server reply
     * const [code, sep] = socket.skip(2, string.find(line, "^(%d%d%d)(.?)"));
     * ```
     */
    function skip(d: number, ret1?: unknown, ret2?: unknown, retN?: unknown): LuaMultiReturn<[unknown, unknown, unknown]>;
    /**
     * Freezes the program execution during a given amount of time.
     *
     * @param time - the number of seconds to sleep for.
     */
    function sleep(time: number): void;
    /**
     * Creates and returns an IPv4 TCP master object. A master object can be transformed into a server object with the method `listen` (after a call to `bind`) or into a client object with the method `connect`. The only other method supported by a master object is the `close` method.
     */
    function tcp(): LuaMultiReturn<[master | unknown, string | unknown]>;
    /**
     * Creates and returns an IPv6 TCP master object. A master object can be transformed into a server object with the method `listen` (after a call to `bind`) or into a client object with the method connect. The only other method supported by a master object is the close method.
     * Note: The TCP object returned will have the option "ipv6-v6only" set to true.
     */
    function tcp6(): LuaMultiReturn<[master | unknown, string | unknown]>;
    /**
     * Creates and returns an unconnected IPv4 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
     */
    function udp(): LuaMultiReturn<[unconnected | unknown, string | unknown]>;
    /**
     * Creates and returns an unconnected IPv6 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
     * Note: The UDP object returned will have the option "ipv6-v6only" set to true.
     */
    function udp6(): LuaMultiReturn<[unconnected | unknown, string | unknown]>;
    namespace dns {
      /**
       * This function converts a host name to IPv4 or IPv6 address.
       * The supplied address can be an IPv4 or IPv6 address or host name.
       * The function returns a table with all information returned by the resolver:
       *
       * `{
       * [1] = {
       * family = family-name-1,
       * addr = address-1
       * },
       * ...
       * [n] = {
       * family = family-name-n,
       * addr = address-n
       * }
       * }
       * `
       *
       * Here, family contains the string `"inet"` for IPv4 addresses, and `"inet6"` for IPv6 addresses.
       * In case of error, the function returns nil followed by an error message.
       *
       * @param address - a hostname or an IPv4 or IPv6 address.
       */
      function getaddrinfo(address: string): LuaMultiReturn<[Record<string | number, unknown> | unknown, string | unknown]>;
      /**
       * Returns the standard host name for the machine as a string.
       *
       * @returns the host name for the machine.
       */
      function gethostname(): string;
      /**
       * This function converts an address to host name.
       * The supplied address can be an IPv4 or IPv6 address or host name.
       * The function returns a table with all information returned by the resolver:
       *
       * `{
       * [1] = host-name-1,
       * ...
       * [n] = host-name-n,
       * }
       * `
       *
       * @param address - a hostname or an IPv4 or IPv6 address.
       */
      function getnameinfo(address: string): LuaMultiReturn<[Record<string | number, unknown> | unknown, string | unknown]>;
      /**
       * This function converts from an IPv4 address to host name.
       * The address can be an IPv4 address or a host name.
       *
       * @param address - an IPv4 address or host name.
       */
      function tohostname(address: string): LuaMultiReturn<[string | unknown, Record<string | number, unknown> | string]>;
      /**
       * This function converts a host name to IPv4 address.
       * The address can be an IP address or a host name.
       *
       * @param address - a hostname or an IP address.
       */
      function toip(address: string): LuaMultiReturn<[string | unknown, Record<string | number, unknown> | string]>;
    }
  }
}

export {};
