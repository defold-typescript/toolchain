export {};

// The Lua standard library is available globally via lua-types, referenced
// from the package entrypoint. Seeding Defold's RNG needs math + os together.
math.randomseed(os.time());
const roll: number = math.random(1, 6);
const formatted: string = string.format("%d", 1);
const items: number[] = [];
table.insert(items, 1);
pcall(() => {});

void roll;
void formatted;

// Sandboxed-runtime stdlib surfaces resolve via lua-types, no first-party .d.ts.
// `package` is a strict-mode reserved word as a bare identifier, so its declared
// namespace is reached through globalThis; the property name itself is allowed.
const trace: string = debug.traceback();
const [handle] = io.open("save.json", "r");
const line: string | undefined = handle?.read("*l");
const searchPath: string = globalThis.package.path;

void trace;
void line;
void searchPath;

// @ts-expect-error randomseed takes a number, not a string.
math.randomseed("x");

// @ts-expect-error the 2-arg randomseed form is 5.4-only and absent under the 5.1 surface.
math.randomseed(1, 2);
