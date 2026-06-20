import { describe, expect, test } from "bun:test";
import { slugify } from "./headings";

describe("slugify", () => {
  test("keeps underscores so on_message-style ids match GitHub", () => {
    expect(slugify("`on_message` ids are hashes, not strings")).toBe(
      "on_message-ids-are-hashes-not-strings",
    );
  });

  test("emits one hyphen per space with no collapse, so a stripped `/` leaves a double hyphen", () => {
    expect(slugify("Unary minus on Vector3 / Vector4 silently produces `number`")).toBe(
      "unary-minus-on-vector3--vector4-silently-produces-number",
    );
  });

  test("leaves a slug without `_` or `/` stable (regression guard)", () => {
    expect(slugify("`as` is a compile-time assertion, not a runtime check")).toBe(
      "as-is-a-compile-time-assertion-not-a-runtime-check",
    );
  });
});
