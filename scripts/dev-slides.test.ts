import { describe, expect, test } from "bun:test";
import { openCommand } from "./dev-slides.ts";

describe("openCommand", () => {
  test("darwin uses open", () => {
    expect(openCommand("darwin", "x/index.html")).toEqual(["open", "x/index.html"]);
  });

  test("linux uses xdg-open", () => {
    expect(openCommand("linux", "x/index.html")).toEqual(["xdg-open", "x/index.html"]);
  });

  test("win32 uses start with an empty title placeholder", () => {
    expect(openCommand("win32", "x/index.html")).toEqual([
      "cmd",
      "/c",
      "start",
      "",
      "x/index.html",
    ]);
  });
});
