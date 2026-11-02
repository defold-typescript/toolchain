/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as tally from "tally.tally";

tally.push(
  () => undefined,
  () => 1,
);
tally.flush();
tally.flush({ verbose: true, pattern: "^on_" });
// @ts-expect-error -- `pattern` is a string.
tally.flush({ pattern: 1 });
