/// <reference path="../index.d.ts" />

declare const client: socket.socket_client;
declare const master: socket.socket_master;
declare const unconnected: socket.socket_unconnected;

socket.select([client], [master, unconnected], 0);

const [readable, writable] = socket.select([client], [master], 0);
const readableSockets: (socket.socket_client | socket.socket_master | socket.socket_unconnected)[] =
  readable;
const writableSockets: (socket.socket_client | socket.socket_master | socket.socket_unconnected)[] =
  writable;
void readableSockets;
void writableSockets;

// @ts-expect-error select socket arrays cannot contain arbitrary strings
socket.select(["not-a-socket"], [], 0);
