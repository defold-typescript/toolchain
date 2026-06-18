/// <reference path="../index.d.ts" />

// The socket handles are method-bearing interfaces, not opaque brands, so their
// documented methods are reachable through the committed declarations.

declare const handleClient: socket.client;
handleClient.send("hi");
handleClient.close();
const [handleData] = handleClient.receive();
void handleData;

declare const handleMaster: socket.master;
handleMaster.listen(5);

// The factory functions still resolve their first slot to the handle interface.
const [connected0] = socket.connect("host", 80);
const [master0] = socket.tcp();
void connected0;
void master0;

// @ts-expect-error send is a client method, not a master method
handleMaster.send("nope");
