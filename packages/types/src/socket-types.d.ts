/** @noSelfInFile */

// LuaSocket-domain aliases mirroring ts-defold-types fixture commit 4f0672a
// (lines 11124-11148). They live only in consumer code — the socket methods keep
// their string/number params — so they are hand-augmented here rather than
// recovered from Defold's ref-doc JSON by the regen pipeline.

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
