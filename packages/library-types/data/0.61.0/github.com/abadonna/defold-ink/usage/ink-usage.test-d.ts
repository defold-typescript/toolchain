/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as story from "ink.story";

// Compile-only proof for the ink fork, written as the calls upstream's README makes.
// No assertions execute; the `dts-declaration-validity` compile is the gate.

export function play(json: string): void {
  const s: story.Story = story.create(json);

  const [paragraphs, answers] = s.continue();
  for (const paragraph of paragraphs) {
    const text: string = paragraph.text;
    const tags: string[] = paragraph.tags;
    void text;
    void tags;
  }
  const count: number = answers.length;
  void count;
  for (const answer of answers) {
    const choice: string = answer.text;
    void choice;
  }

  const [next] = s.continue(1);
  void next;

  const [restored, restoredAnswers] = s.restore(s.get_state());
  void restored;
  void restoredAnswers;
  s.restore(s.get_state(), true, true);

  const [loaded] = s.deserialize(s.serialize(), "knot");
  void loaded;

  s.add_observer("x", (v) => print(v));
  s.remove_observer("x");
  s.assign_value("x", 1);
  s.bind("add", (a: number, b: number) => a + b);
  s.switch_flow("side");
  s.switch_flow();
  s.jump("knot.stitch");
  const value: unknown = s.eval("x + 1");
  void value;
  const variables: LuaTable<string, unknown> = s.variables;
  void variables;

  // @ts-expect-error an answer is its 1-based index, not its text
  s.continue("1");
  // @ts-expect-error jump needs the knot or stitch to go to
  s.jump();
}
