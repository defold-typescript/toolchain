/** @noSelfInFile */

// `socket-types.d.ts` ships the standalone type aliases the pinned
// ts-defold-types fixture (commit 4f0672a, Defold 1.12.4) declares inside
// its second `namespace socket` block (fixture lines 11124-11148). The
// receiver-interface methods in `generated/socket.d.ts` keep their fixture-
// equivalent `string` / `number` parameter types — these aliases exist for
// consumer code to spell out the literal sets explicitly:
//
//   const opt: socket.TCPOptions = 'keepalive';
//   // TCP/UDP are convenience intersections for consumer annotations;
//   // no socket.* function returns them (tcp() yields a `master` handle).
//
// The literal unions are LuaSocket-domain, not engine-ref-doc, so they live
// here rather than in the regen pipeline.

declare global {
  namespace socket {
    /** A TCP handle in any of its three lifecycle roles. */
    type TCP = client & master & server;
    /** Option names accepted by a TCP handle's `setoption`. */
    type TCPOptions = "ipv6-v6only" | "keepalive" | "linger" | "reuseaddr" | "tcp-nodelay";
    /** Error string a TCP `receive` may return. */
    type TCPReceiveError = "closed" | "timeout";
    /** Read pattern accepted by a TCP `receive`. */
    type TCPReceivePattern = number | "*a" | "*l";
    /** Direction passed to a TCP handle's `shutdown`. */
    type TCPShutdownMode = "both" | "receive" | "send";
    /** Blocking mode passed to a TCP handle's `settimeout`. */
    type TCPTimeoutMode = "b" | "t";
    /** A UDP handle in either of its two lifecycle roles. */
    type UDP = connected & unconnected;
    /** Option names accepted by a UDP handle's `setoption`. */
    type UDPOptions =
      | "broadcast"
      | "dontroute"
      | "ip-add-membership"
      | "ip-drop-membership"
      | "ip-multicast-if"
      | "ip-multicast-loop"
      | "ip-multicast-ttl"
      | "ipv6-v6only"
      | "reuseaddr"
      | "reuseport";
  }
}

export {};
