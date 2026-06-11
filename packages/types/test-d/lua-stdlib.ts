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

// @ts-expect-error randomseed takes a number, not a string.
math.randomseed("x");

// @ts-expect-error the 2-arg randomseed form is 5.4-only and absent under the 5.1 surface.
math.randomseed(1, 2);
