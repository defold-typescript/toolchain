import { describe, expect, test } from "bun:test";
import socketDoc from "../fixtures/socket_doc.json" with { type: "json" };
import { parseDefoldApiDoc } from "./api-doc";
import { DEFOLD_TYPE_MAP } from "./core-types";
import { collectHandleMethodGroups, SOCKET_HANDLE_TOKENS } from "./emit-dts";

// The socket receiver interfaces (client/master/server/connected/unconnected)
// are generated end-to-end from the `<receiver>:<method>` colon methods in
// socket_doc.json. The emit-dts suite already pins the receiver *key* set and
// the 55-method *total*, but a count is blind to a rename or a method moving
// between receivers (55 stays 55). These guards pin the per-receiver method
// names and tie the two hand-maintained socket lists back to the doc.

function deriveReceiverMethods(): Map<string, string[]> {
  const module = parseDefoldApiDoc(socketDoc);
  const groups = collectHandleMethodGroups(module);
  const out = new Map<string, string[]>();
  for (const [receiver, fns] of groups) {
    out.set(receiver, fns.map((fn) => fn.name).sort());
  }
  return out;
}

const EXPECTED_RECEIVER_METHODS: Record<string, string[]> = {
  client: [
    "close",
    "dirty",
    "getfd",
    "getoption",
    "getpeername",
    "getsockname",
    "getstats",
    "receive",
    "send",
    "setfd",
    "setoption",
    "setstats",
    "settimeout",
    "shutdown",
  ],
  connected: [
    "close",
    "getoption",
    "getpeername",
    "getsockname",
    "receive",
    "send",
    "setoption",
    "setpeername",
    "settimeout",
  ],
  master: [
    "bind",
    "close",
    "connect",
    "dirty",
    "getfd",
    "getsockname",
    "getstats",
    "listen",
    "setfd",
    "setstats",
    "settimeout",
  ],
  server: [
    "accept",
    "close",
    "dirty",
    "getfd",
    "getoption",
    "getsockname",
    "getstats",
    "setfd",
    "setoption",
    "setstats",
    "settimeout",
  ],
  unconnected: [
    "close",
    "getoption",
    "getsockname",
    "receive",
    "receivefrom",
    "sendto",
    "setoption",
    "setpeername",
    "setsockname",
    "settimeout",
  ],
};

describe("socket receiver-interface drift guard", () => {
  test("each receiver's method-name set matches the fixture-derived set", () => {
    const derived = deriveReceiverMethods();
    const asObject = Object.fromEntries(derived);
    expect(asObject).toEqual(EXPECTED_RECEIVER_METHODS);
  });

  test("every fixture-derived receiver self-maps in DEFOLD_TYPE_MAP", () => {
    // A new receiver appearing upstream would emit `interface <name>` but leave
    // any function param typed `<name>` unresolved until the map gains a key.
    for (const receiver of deriveReceiverMethods().keys()) {
      expect(DEFOLD_TYPE_MAP[receiver]).toBe(receiver);
    }
  });

  test("every socket.select handle token is a real fixture-derived receiver", () => {
    // SOCKET_HANDLE_TOKENS is the select-coercion subset, not the full receiver
    // set, so the invariant is subset — a renamed/removed receiver must not
    // leave a dangling token.
    const receivers = new Set(deriveReceiverMethods().keys());
    for (const token of SOCKET_HANDLE_TOKENS) {
      expect(receivers.has(token)).toBe(true);
    }
  });
});
