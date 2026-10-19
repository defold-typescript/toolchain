/// <reference path="../index.d.ts" />

// The socket handles are method-bearing interfaces, not opaque brands, so their
// documented methods are reachable through the committed declarations.

declare const handleClient: socket.socket_client;
handleClient.send("hi");
handleClient.close();
const [handleData] = handleClient.receive();
void handleData;

declare const handleMaster: socket.socket_master;
handleMaster.listen(5);

// The factory functions still resolve their first slot to the handle interface.
const [connected0] = socket.connect("host", 80);
const [master0] = socket.tcp();
const connectedHandle: socket.socket_client | undefined = connected0;
const masterHandle: socket.socket_master | undefined = socket.tcp()[0];
void connectedHandle;
void masterHandle;
void master0;

// @ts-expect-error send is a client method, not a master method
handleMaster.send("nope");

// Each handle has one name: the receiver spellings are not declared.
// @ts-expect-error socket.client is not a declared type
declare const oldClient: socket.client;
// @ts-expect-error socket.connected is not a declared type
declare const oldConnected: socket.connected;
// @ts-expect-error socket.master is not a declared type
declare const oldMaster: socket.master;
// @ts-expect-error socket.server is not a declared type
declare const oldServer: socket.server;
// @ts-expect-error socket.unconnected is not a declared type
declare const oldUnconnected: socket.unconnected;
void [oldClient, oldConnected, oldMaster, oldServer, oldUnconnected];
