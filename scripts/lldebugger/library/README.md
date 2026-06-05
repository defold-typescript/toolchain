# defold-lldebugger

Setup script that loads the [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) runtime module for debugging in Visual Studio Code.

## Defold Setup
Open your game.project file and in the dependencies field under project add:
```
https://github.com/ts-defold/defold-lldebugger/archive/extension.zip
```

Require the lldebugger module and start the debugger in your main script.  
*Typically you would want to do this as earlier as possible in your game's startup*
```lua
local lldebugger = require("lldebugger.debug")
lldebugger.start()
```

## VS Code Setup
1. Install the [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) extension
2. Copy the `.vscode` folder into your defold project directory
3. [Optional] Edit the `.vscode/launch.json` per the instructions [here](https://github.com/tomblind/local-lua-debugger-vscode)

## Launch
Set your breakpoints then launch the Debug configuration.
The `defold.sh` script will download a standalone `dmengine` and execute your game.project directly from VS Code.
You will need to continue using the Defold Editor to build your project though this will be updated in the future.

## About
This script loads the `lldebugger` module contained in the local lua debugger vscode extension, 
and if the debugger is running will execute the runtime script so that the debugger may attach 
to your game.

The `lldebugger` module will only load in debug builds and only executes if the debugger is running.
So you may safely leave the initalization code in your game when publishing.


### Shoutouts 📢
[@tomblind](https://github.com/tomblind) for all the hard work on [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode).  
[@astrochili](https://github.com/astrochili) for paving the way and building the [defold-vscode-guide](https://github.com/astrochili/defold-vscode-guide) that the `defold.sh` script is cribbed from.  
[TypeScriptToLua](https://github.com/TypeScriptToLua/TypeScriptToLua) for the awesome community and tools.  

---

## Vendored snapshot provenance

This directory is a **pinned snapshot** of the Lua-only Defold library payload
from:

- Source repo: https://github.com/ts-defold/defold-lldebugger (branch `extension`)
- Commit: `fa208780b2b4dffbbbb80d73760056f5ab9c59a1`
- License: MIT (see `LICENSE`)

Only the library-archive payload is vendored — `game.project` (the load-bearing
`[library] include_dirs = lldebugger`), the `lldebugger/` module and source map,
`LICENSE`, and this `README.md`. The upstream `.vscode/`, `example/`, and
`input/` trees are intentionally omitted.

Bumping this snapshot is a manual, reviewed change: refresh the bytes, update
the commit sha above, and re-baseline the packer test.
