/// <reference path="../index.d.ts" />

declare const client: socket.SocketClient;
declare const master: socket.SocketMaster;
declare const unconnected: socket.SocketUnconnected;

socket.select([client], [master, unconnected], 0);

const [readable, writable] = socket.select([client], [master], 0);
const readableSockets: (socket.SocketClient | socket.SocketMaster | socket.SocketUnconnected)[] =
  readable;
const writableSockets: (socket.SocketClient | socket.SocketMaster | socket.SocketUnconnected)[] =
  writable;
void readableSockets;
void writableSockets;

// @ts-expect-error select socket arrays cannot contain arbitrary strings
socket.select(["not-a-socket"], [], 0);
