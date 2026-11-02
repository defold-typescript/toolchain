/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as stamp from "stamp";

const _next: string = stamp.issue();
const _first: string = stamp.at(1);
// @ts-expect-error -- `at` takes a position.
stamp.at("first");
