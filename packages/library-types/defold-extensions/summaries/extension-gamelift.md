---
api: untyped
---

## What it ships

A native extension that runs a Defold game server against the Amazon
GameLift Server SDK, with prebuilt SDK libraries for Linux and macOS. It
registers a `gamelift` Lua module with functions such as `gamelift.init`,
`gamelift.process_ready` and `gamelift.accept_player_session`. The
repository also contains an example client project.

## Using it

1. On the server, call `gamelift.init` with a port and listener functions for
   session start, process termination and health checks.
2. Report readiness with `gamelift.process_ready`.
