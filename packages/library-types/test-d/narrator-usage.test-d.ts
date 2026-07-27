/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as narrator from "narrator.narrator";

// Compile-only proof (mirroring squid-usage.test-d.ts) that the narrator LuaLS
// golden is runtime-faithful: `parse_content` needs only its `content` argument,
// and `Story.continue` returns a single paragraph or an array of them. The
// interfaces are not exported from the module, so the proof drives them by
// inference from the module functions rather than named imports. No assertions
// execute; tsc --noEmit under tsconfig.dts-check.json (skipLibCheck: false) is the
// gate. A regression (inclusions turning required again, or continue narrowing
// back to an array-only return) is a compile error here.

const book = narrator.parse_content("=== knot ===");
const story = narrator.init_story(book);
type Story = typeof story;

// Matches the emitted `Narrator_Paragraph` shape under exactOptionalPropertyTypes:
// its optional `tags` carries an explicit `| undefined`, so the structural mirror must
// too, or the exact-equality below reads them as distinct.
type Para = { text: string; tags?: string[] | undefined };

// True iff A and B are mutually assignable — catches `continue` narrowing back to
// `Para[]` (a single `Para` is not assignable to it) or widening past the union.
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const continueReturnsArrayOrParagraph: MutuallyAssignable<
  ReturnType<Story["continue"]>,
  Para[] | Para
> = true;

const one = story.continue(1);
if (!Array.isArray(one)) {
  const text: string = one.text;
  void text;
}

void book;
void continueReturnsArrayOrParagraph;
