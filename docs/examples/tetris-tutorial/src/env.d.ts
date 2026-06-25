// Defold ambient surface entrypoint for the standalone tetris type-check.
// The universal hash() builtin is declared by @defold-typescript/types; raw Lua
// globals such as math, pairs, and print are still intentionally absent.

// Pulls in the ambient surfaces this example builds against: the `.script` kind
// (go, vmath, msg, factory, sprite, ...) for `board.ts`, and the `.gui_script`
// kind (which adds `gui`) for `hud.ts`. The transpiler seeds these namespaces
// itself per file and resolves these specifiers to empty stubs, so the imports
// are harmless there; they exist only so the standalone editor / tsc check sees
// both surfaces at once.
import "@defold-typescript/types/script";
import "@defold-typescript/types/gui-script";
