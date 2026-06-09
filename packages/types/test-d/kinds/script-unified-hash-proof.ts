import type { Hash } from "@defold-typescript/types";
import "@defold-typescript/types/script";

// Ambient hash() ships on the /script surface and unifies with the imported
// branded Hash — one Hash, no dual-brand TS2367/TS2345.
const h: Hash = hash("x");
void h;

vmath.vector3(1, 2, 3);

// @ts-expect-error gui.* is absent on the script surface
gui.get_width();

// @ts-expect-error render.* is absent on the script surface
render.get_width();
