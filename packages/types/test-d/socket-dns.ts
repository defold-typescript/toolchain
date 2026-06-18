/// <reference path="../index.d.ts" />

// socket.dns is emitted as a nested namespace; its resolver functions must be
// reachable through the committed declarations.
const ip = socket.dns.toip("localhost");
void ip;
