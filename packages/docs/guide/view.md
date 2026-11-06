---
toc-title: view
---
# view

`view` opens a file's [state machines](./state-machines.md) and [entity worlds](./entity-systems.md) in your browser and runs them there, `when` checks, `run` code, systems and context included. You see the source exactly as you wrote it, with the active states tinted and each system's entities listed, and you drive the run by sending events and stepping time. No game and no Defold editor are needed, though the page can also [attach to a running game](#attach-to-a-running-game).

```sh
bunx @defold-typescript/cli view src/player-machine.ts
bunx @defold-typescript/cli view src/enemies.ts guard
```

The command loads the file, serves the viewer on a free port on `127.0.0.1`, and prints its URL:

```text
view: /home/me/game/src/player-machine.ts at http://127.0.0.1:52998 (Ctrl+C stops)
```

Open the URL in a browser. The command runs until you press Ctrl+C. The page is one self-contained document, so it works offline.

## Pick a machine or world

The page has a Machines tab for the file's machines and a [Worlds tab](#worlds) for the `ecs` worlds its run creates. A file with both shows both tabs, and a file with one kind shows that tab alone.

- **Machines.** The machine dropdown lists every machine the loaded files define, even when there is only one. A machine is named by its `defineMachine` key, else by the name it is exported under. One machine runs at a time: picking another starts it fresh, and only its states are highlighted.
- **Worlds.** The world dropdown lists every world the run created, named by the `self` field or export that holds it, else `world-<n>`.
- **`[name]`** picks every machine and every world of that name; without it, the first machine in file order and the first world the run created are picked.
- **The opening tab** is Machines when `[name]` matched a machine or the file creates no world, else Worlds, since a world drives the run.

## Read the code

The page shows each loaded file whole, as it is on disk, with line numbers and syntax colors. Nothing is inserted into the code:

- **Highlights.** Each key under `states` is tinted while that state is active. Each entry into a state starts a short glow that fades out, so a state the machine passes through within one step glows without staying tinted.
- **Fired rules.** A step that moves the machine glows the rule that did it, in the state that took it: the `on` key and the array entry that fired, the `after` delay key or the whole entry of an `after` list (whether its `delay` is a number or a function of the context), the `always` entry, or the `update` hook. An `every` entry that ran glows the same way, on its delay key or on the whole entry of an `every` list; that glow is a run, not a move. An `on` entry whose `when` turned the event away glows more dimly for the same time, even when no rule takes the event; such an event is logged as taken by no rule. A [`can`](./state-machines.md#ask-whether-an-event-would-be-taken) call a hook makes glows nothing. An `after` timer whose `when` returned `false` glows dimly on each step that checks it, so during Play it stays lit until it fires or its state is left.
- **Several files.** A machine or world spread over several files shows every project file the load runs: the entry file, then each file it imports, in first-import order. The name of each file where something is happening is lit.
- **Two layouts.** A toggle switches between a file list beside one file's source, and all files stacked in one scrolling page. The dividers keep their sizes across page reloads.
- **Search.** Ctrl+F (Cmd+F on macOS) opens the page's own search, which steps through matches across every loaded file.

Light and dark follow your system setting.

## Run the machine

Machines and worlds run on one clock. Time starts paused. The bar at the top holds the controls, and Restart, Play, Step, the speed, `t` and the frame count stay in it on both tabs:

- **Start** takes a starting context and starts the picked machine fresh. The run's clock and worlds keep going. For a machine with [private fields](./state-machines.md#private-fields-with-privatectx), the starting context holds the context fields alone: the machine builds its private fields, and the ctx panel shows both.
- **Events.** One button per event the active states accept, with a payload field for the event's other fields. An `on` key in an active state is also clickable in the code and sends that event with the bar's payload.
- **Field syntax.** The starting context and the payload are written as a TypeScript object literal or as JSON, so `{ enter: true, from: 'pad' }` and `{ "enter": true, "from": "pad" }` read the same. Every value must be a literal: a number, string, boolean, `null`, array or object. A field that cannot be read is outlined in red while you type, and a row under the bar shows its message, which names the column of a syntax mistake.
- **Dialog.** The button beside each of the two fields opens its text in a dialog with a multi-line editor. An error under the editor names the line and column of a syntax mistake. `Start` or `Apply` (or Ctrl+Enter, Cmd+Enter on macOS) writes the text back to the field, and `Start` also starts the machine. Cancel or Escape discards the text.
- **Play and Pause.** Play runs one frame per browser frame with the real time since the last frame, capped at 0.1 s and scaled by the speed choice (1x, 1/2x, 1/4x, 0.1x). A frame updates the file's [script and worlds](#what-runs-and-what-is-stubbed), then the machine, so `after` timers, `every` entries and `update` hooks run as they would in a game.
- **Step** runs one frame with the bar's `dt` while paused. The bar shows the run time `t` and the frame count, which count from when the run started, not from the last Start.
- **Restart** reruns the files and the script's `init` in fresh runtimes from `t` 0, so a seeded run replays the same way. A Restart with no error clears a failed reload's banner.
- **Instance.** The instance dropdown lists `simulated` and each machine instance the run started, named `<world> entity <id>` when an entity holds it, else `instance <id>`. Picking one follows it: its states, ctx and events show in place of the simulated machine's, tinted as the run moves it. `simulated`, Start or another machine returns to the simulated one.

A ctx panel beside the code shows the shown instance's ctx as an expandable tree, and a changed value glows. A number, string, boolean or `null` can be edited in place; the edit takes effect on the next frame and is logged.

## Worlds

The Worlds tab shows the picked world. The world dropdown switches to another one.

- **Systems.** One row per system, in the world's order: its index, its name (its key, else its export name, else `system <index>`), how many entities it holds, and its time in the last frame and on average, in milliseconds. A `nocache` system keeps no entity list and shows `-`. An inactive system reads `inactive`, and an `interval` shows.
- **Timings.** A frame's time counts each system's work in the script's (or the worlds') `update` and in the machine's `update`. The times are Node's, for comparing systems with each other, not a game's frame budget.
- **Entities.** Clicking a row lists the system's entities by id, each with its components as a read-only tree. A nested object opens one level per click.
- **Links.** Clicking a system's name scrolls the code to the callbacks it was built from and tints them. Clicking those callbacks in the code opens the system on the Worlds tab. An entity that holds a machine instance names it, and clicking the name follows that instance on the Machines tab, with its states tinted as the world moves it.

## Read the log

The log docks at the bottom with its newest line last. Each line shows its run time. A line identical to the one above merges into it, and a count badge shows the repeats. One toggle per kind hides that kind: transitions, events, engine calls, `print`, and membership, a line for each entity that joins or leaves a system of the picked world. A system removed from the world logs a leave for every entity it held. Errors and reloads always show. Every failed action adds an error line: a field a button could not read, a request the command refused, or a lost connection. The log follows the newest line unless you scroll up, and following resumes when you scroll back to the bottom. It keeps the newest 500 lines.

## What runs and what is stubbed

The CLI compiles the file with TypeScript and runs it in Node. `@defold-typescript/types/hsm` and `@defold-typescript/types/ecs` resolve to the same hsm and ecs runtimes your game ships, so a machine or a world behaves here as it does in the engine.

- **Scripts and worlds.** When the file default-exports a script (`defineScript`), its `init` runs once when the command starts, with `self` holding the script's `properties`, and what `init` returns is merged onto `self`, as in a game. Each frame then calls the script's `update(self, dt)`, or each world's `update(dt)` when the file exports no script. A file that creates a world can play and step before its machine starts.
- **Engine globals.** `hash`, `print`, `pprint` and `tostring` work: `hash("walk")` is the string `hash: [walk]`, and `print` writes to the log.
- **Simulated engine values.** Lua 5.1's `math` works, and `math.random` draws the same numbers each time the command starts or the run restarts. `os.clock` counts seconds. `vmath.vector3` and `vmath.vector4` build plain `x`/`y`/`z`/`w` objects. `go.get_position` and `go.get_world_position` return zero vectors, `msg.url` returns an empty table, `sys.get_engine_info().is_debug` is `true`, and `sys.get_config_string` returns its default. `factory.create` returns `hash: [instance 1]`, then `hash: [instance 2]`, and is logged, since nothing spawns.
- **Stubs.** Every other engine global or member a file names (`sprite`, `msg.post`, `go.set_position`) is a stub. A call returns `undefined` and is logged as not simulated, and a constant read returns its own name. Lua's own `select` is not an engine global and is `undefined` here, so ecs's filters reject a bad token as they do in a game.
- **Imports.** A relative import loads the project file it names. `defineScript`, `defineGuiScript` and `defineRenderScript` from `@defold-typescript/types` return the table they are given. Any other `@defold-typescript/types` path is empty, since it holds declarations only. Any other import stops the load with an error naming it and the file that imports it.

## Live reload

Editing any loaded file reloads the page without restarting the command. The files rerun in the same hsm and ecs runtimes, as a game's hot reload does:

- A **script** keeps its `self` and its worlds, and its entities keep their ids. `init` does not run again; the script's `on_reload(self)` runs once, and the next frame calls the edited `update`.
- A **keyed** machine (`defineMachine("player")`) moves to the new config and keeps its state path and ctx, as [hot reload](./state-machines.md#hot-reload) does in a game. A keyed private machine gains the fields a new `privateCtx` adds and keeps the values it has.
- An **unkeyed** machine restarts from its `initial` with the last starting ctx, and the log says why.

A reload that removes or renames the picked machine picks the first machine the files define. A page [attached to a running game](#attach-to-a-running-game) keeps following its instance against that machine.

A reload that fails, such as a syntax error, shows its error in a banner. The page keeps the last source, machine and worlds that loaded until a reload succeeds. When the command stops, the page shows "disconnected".

## Attach to a running game

The page can follow a running game instead of the simulation, tinting the states of one machine instance as the game moves it:

1. Run `view` from your Defold project folder, the one the editor has open. It reads the editor's console, so only a game launched from that editor (Project > Build) is seen. An editor opened or a game launched after the page is fine.
2. In the game, call [`inspect(instance, label)`](./state-machines.md#debug-a-machine) on each instance you want to follow. Each label shows up in the bar's live dropdown; a repeated label is listed with its ordinal (`enemy#2`), as the game draws it, and a stopped instance is marked `(stopped)`.
3. Pick the machine the instance runs in the machine dropdown, then pick its label in the live dropdown. The page does not guess which machine a label belongs to.

While attached, the active states are tinted from the leaves the game reports, each entry glows, and each move is logged with its event or cause. Each move also glows the rule that made it, as in [the simulation](#read-the-code). Nothing glows dimly and an `every` run does not glow, since the game reports moves only. A move whose line names no rule, or a rule the picked machine does not define, glows none. Start, the event buttons, Play and Step are off, and the ctx panel reads "ctx is not sent by the game". Choosing `live: off` or another machine detaches and shows the simulation where it was. When the game restarts, the list empties and an attached page detaches with a log line.

A banner names any reported state the picked machine does not define: either a different machine is picked, or the game runs source other than the files on disk. The states it does define stay tinted. A release build reports nothing, as `inspect` does nothing there.

## Errors

Every reason the viewer cannot start exits 1 with one message: a missing file, a file that defines no machine and creates no world, an unknown `[name]` (the message lists the machine and world names), a throw while loading or in the script's `init`, or a local server that cannot start listening.

Any throw halts the run, and the page shows the message. After a throw in one of the simulated machine's hooks, Start continues the run. After a throw in the script's `update` or `on_reload`, in a system, or in an instance the run started, only Restart continues. Editing a file while halted still loads it, so Restart runs the edited source.

A failed action that belongs to no field also shows in a popup that closes by itself. The banner under the bar shows what still holds: a lost connection, a failed reload, a halted run, or a live instance in a state the picked machine does not define.

## JSON output

With `--json` the command prints one line once the viewer is serving:

```json
{"command":"view","ok":true,"written":[],"machine":"playerMachine","world":"garden","url":"http://127.0.0.1:52998"}
```

`machine` and `world` name the picked machine and world, and each is left out when the file has none. A failure prints `{"command":"view","ok":false,"error":"..."}` and exits 1.
