import { describe, expect, test } from "bun:test";
import { scaffoldStrictness } from "./scaffold-strictness";

describe("scaffoldStrictness", () => {
  test("a flag the scaffold omits counts as false", () => {
    expect(scaffoldStrictness({})).toEqual({
      exactOptionalPropertyTypes: false,
      noUncheckedIndexedAccess: false,
    });
  });

  test("a flag the scaffold sets keeps its value and the other stays false", () => {
    expect(scaffoldStrictness({ exactOptionalPropertyTypes: true })).toEqual({
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: false,
    });
  });
});
