/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as printer from "printer.printer";

// Compile-only proof for the printer fork, written as the calls upstream's README makes
// from a gui_script. No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// is the gate.

export function setup(self: unknown): void {
  const p: printer.Printer = printer.new(self, "printer");
  const started: boolean = p.print("{red}hi", "Illidan");
  void started;
  p.update(0.016);

  // `new` leaves `is_print` unset until the first print, fadeout or final.
  const printing: boolean | undefined = p.is_print;
  void printing;
  // @ts-expect-error `is_print` is nil on a fresh instance, so it is not a plain boolean
  const always: boolean = p.is_print;
  void always;

  if (p.is_print) {
    p.instant_appear();
  }

  printer.add_styles({ red: { color: "#FF0000" } });
  printer.add_source_style("Illidan", "red");
  printer.add_word_style("powerful", "red");

  // @ts-expect-error a style color is a hex code string
  printer.add_styles({ red: { color: 1 } });
  // @ts-expect-error print needs the text to write
  p.print();

  const viaModule: boolean = printer.print(p, "text");
  void viaModule;
  p.final();
}
