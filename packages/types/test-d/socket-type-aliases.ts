/// <reference path="../index.d.ts" />

// The standalone LuaSocket aliases are exported for consumer code, so a literal
// in each alias's set assigns cleanly and the intersection aliases resolve
// against the committed receiver interfaces.

const tcpOptions: socket.TCPOptions = "keepalive";
const tcpReceivePattern: socket.TCPReceivePattern = "*l";
const tcpReceiveError: socket.TCPReceiveError = "timeout";
const tcpShutdownMode: socket.TCPShutdownMode = "both";
const tcpTimeoutMode: socket.TCPTimeoutMode = "b";
const udpOptions: socket.UDPOptions = "broadcast";

const tcpHandle = undefined as unknown as socket.TCP;
const udpHandle = undefined as unknown as socket.UDP;

void [
  tcpOptions,
  tcpReceivePattern,
  tcpReceiveError,
  tcpShutdownMode,
  tcpTimeoutMode,
  udpOptions,
  tcpHandle,
  udpHandle,
];
