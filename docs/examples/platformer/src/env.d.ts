// Defold ambient surface entrypoint for the standalone platformer type-check.
// The universal hash() builtin is declared by @defold-typescript/types; raw Lua
// globals such as math, pairs, and print are still intentionally absent.

// Pulls in the ambient .script surface (go, vmath, msg, sprite, ...) for the
// editor / standalone tsc. The transpiler seeds these namespaces itself and
// resolves this specifier to an empty stub, so the import is harmless there.
import "@defold-typescript/types/script";
