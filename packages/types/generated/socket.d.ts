/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  namespace socket {
    type client = Opaque<"client">;
    type master = Opaque<"master">;
    type unconnected = Opaque<"unconnected">;
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
    function connect(address: string, port: number, locaddr?: string, locport?: number, family?: string): LuaMultiReturn<[Opaque<"client"> | unknown, string | unknown]>;
    /**
     * Returns the time in seconds, relative to the system epoch (Unix epoch time since January 1, 1970 (UTC) or Windows file time since January 1, 1601 (UTC)).
     * You should use the values returned by this function for relative measurements only.
     *
     * @returns the number of seconds elapsed.
     */
    function gettime(): number;
    /**
     * This function creates and returns a clean try function that allows for cleanup before the exception is raised.
     * The `finalizer` function will be called in protected mode (see protect).
     *
     * @param finalizer - a function that will be called before the try throws the exception.
     * @returns the customized try function.
     */
    function newtry(finalizer: () => void): (...args: unknown[]) => unknown;
    /**
     * Converts a function that throws exceptions into a safe function. This function only catches exceptions thrown by try functions. It does not catch normal Lua errors.
     * Beware that if your function performs some illegal operation that raises an error, the protected function will catch the error and return it as a string. This is because try functions uses errors as the mechanism to throw exceptions.
     *
     * @param func - a function that calls a try function (or assert, or error) to throw exceptions.
     * @returns an equivalent function that instead of throwing exceptions, returns `nil` followed by an error message.
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
    function select(recvt: Record<string | number, unknown>, sendt: Record<string | number, unknown>, timeout?: number): LuaMultiReturn<[Record<string | number, unknown>, Record<string | number, unknown>, string | unknown]>;
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
    function tcp(): LuaMultiReturn<[Opaque<"master"> | unknown, string | unknown]>;
    /**
     * Creates and returns an IPv6 TCP master object. A master object can be transformed into a server object with the method `listen` (after a call to `bind`) or into a client object with the method connect. The only other method supported by a master object is the close method.
     * Note: The TCP object returned will have the option "ipv6-v6only" set to true.
     */
    function tcp6(): LuaMultiReturn<[Opaque<"master"> | unknown, string | unknown]>;
    /**
     * Creates and returns an unconnected IPv4 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
     */
    function udp(): LuaMultiReturn<[Opaque<"unconnected"> | unknown, string | unknown]>;
    /**
     * Creates and returns an unconnected IPv6 UDP object. Unconnected objects support the `sendto`, `receive`, `receivefrom`, `getoption`, `getsockname`, `setoption`, `settimeout`, `setpeername`, `setsockname`, and `close` methods. The `setpeername` method is used to connect the object.
     * Note: The UDP object returned will have the option "ipv6-v6only" set to true.
     */
    function udp6(): LuaMultiReturn<[Opaque<"unconnected"> | unknown, string | unknown]>;
  }
}

export {};
