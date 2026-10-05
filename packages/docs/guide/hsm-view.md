---
toc-title: hsm-view
---
# hsm-view

`hsm-view` opens a [state machine](./state-machines.md) file in your browser and runs it there, `when` checks, `run` code and context included. You see the source exactly as you wrote it, with the active states tinted, and you drive the machine by sending events and stepping time. No game and no Defold editor are involved.

```sh
bunx @defold-typescript/cli hsm-view src/player-machine.ts
bunx @defold-typescript/cli hsm-view src/enemies.ts guard
```

The command loads the file, serves the viewer on a free port on `127.0.0.1`, and prints its URL:

```text
hsm-view: /home/me/game/src/player-machine.ts at http://127.0.0.1:52998 (Ctrl+C stops)
```

Open the URL in a browser. The command runs until you press Ctrl+C. The page is one self-contained document, so it works offline.

## Pick a machine

The page has a machine dropdown that lists every machine the loaded files define, even when there is only one. The optional `[name]` picks which one opens first; without it, the first machine in file order opens. A machine is named by its `defineMachine` key, else by the name it is exported under.

One machine runs at a time. Picking another in the dropdown starts it fresh, and only its states are highlighted.

## Read the code

The page shows each loaded file whole, as it is on disk, with line numbers and syntax colors. Nothing is inserted into the code:

- **Highlights.** Each key under `states` is tinted while that state is active. Each entry into a state starts a short glow that fades out, so a state the machine passes through within one step glows without staying tinted.
- **Fired rules.** A step that moves the machine glows the rule that did it, in the state that took it: the `on` key and the array entry that fired, the `after` delay key, the `always` entry, or the `update` hook. An event no rule takes marks nothing and is logged as taken by no rule.
- **Several files.** A machine spread over several files shows every project file the load runs: the entry file, then each file it imports, in first-import order. The name of each file where something is happening is lit.
- **Two layouts.** A toggle switches between a file list beside one file's source, and all files stacked in one scrolling page. The dividers keep their sizes across page reloads.
- **Search.** Ctrl+F (Cmd+F on macOS) opens the page's own search, which steps through matches across every loaded file.

Light and dark follow your system setting.

## Run the machine

Time starts paused. The bar at the top holds the controls:

- **Start** takes a starting context as JSON and starts the machine.
- **Events.** One button per event the active states accept, with a payload field. An `on` key in an active state is also clickable in the code and sends that event with the bar's payload.
- **Play and Pause.** Play calls `update` once per browser frame with the real time since the last frame, capped at 0.1 s and scaled by the speed choice (1x, 1/2x, 1/4x, 0.1x). `after` timers and `update` hooks run as they would in a game.
- **Step** runs one `update` with the bar's `dt` while paused. The bar shows the elapsed machine time `t`.

A ctx panel beside the code shows the running instance's ctx as an expandable tree, and a changed value glows. A number, string, boolean or `null` can be edited in place; the edit takes effect on the next frame and is logged.

## Read the log

The log docks at the bottom with its newest line last. Each line shows its machine time. A line identical to the one above merges into it, and a count badge shows the repeats. One toggle per kind (transitions, events, engine calls, `print`) hides that kind; errors and reloads always show. The log follows the newest line unless you scroll up, and following resumes when you scroll back to the bottom. It keeps the newest 500 lines.

## What runs and what is stubbed

The CLI compiles the file with TypeScript and runs it in Node. `@defold-typescript/types/hsm` resolves to the same hsm runtime your game ships, so a machine behaves here as it does in the engine.

- **Engine globals.** `hash`, `print`, `pprint` and `tostring` work: `hash("walk")` is the string `hash: [walk]`, and `print` writes to the log. Every other engine global a file names (`sprite`, `msg`, `go`) is a stub. A call returns `undefined` and is logged as not simulated, and a constant read returns its own name.
- **Imports.** A relative import loads the project file it names. Any `@defold-typescript/types` path other than the `hsm` modules is empty, since it holds declarations only. Any other import stops the load with an error naming it and the file that imports it.

## Live reload

Editing any loaded file reloads the page without restarting the command. The files rerun in the same hsm runtime:

- A **keyed** machine (`defineMachine("player")`) moves to the new config and keeps its state path and ctx, as [hot reload](./state-machines.md#hot-reload) does in a game.
- An **unkeyed** machine restarts from its `initial` with the last starting ctx, and the log says why.

A reload that fails, such as a syntax error, shows its error in a banner. The page keeps the last source and machine that loaded until a reload succeeds. When the command stops, the page shows "disconnected".

## Errors

Every reason the viewer cannot start exits 1 with one message: a missing file, a file that defines no machine, an unknown `[name]` (the message lists the machine names), a throw while loading, or a local server that cannot start listening.

A throw inside a hook while the machine runs halts it. The page shows the message, and only Start continues. Editing a file while halted still loads it, so the restart runs the edited source.

## JSON output

With `--json` the command prints one line once the viewer is serving:

```json
{"command":"hsm-view","ok":true,"written":[],"machine":"playerMachine","url":"http://127.0.0.1:52998"}
```

A failure prints `{"command":"hsm-view","ok":false,"error":"..."}` and exits 1.
