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

Add the repository's master zip or a specific release zip to the
`game.project` dependencies. The server calls `gamelift.init` with a port
and listener functions for session start, process termination and health
checks, then reports readiness with `gamelift.process_ready`.
