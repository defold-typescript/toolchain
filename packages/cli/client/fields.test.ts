import { describe, expect, test } from "bun:test";
import { fieldError, InputError, readDt, readPayload, readStartCtx } from "./fields";

function refusal(read: () => unknown): InputError {
  try {
    read();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(InputError);
    return thrown as InputError;
  }
  throw new Error("the text was read");
}

describe("field readers", () => {
  test("read an empty start ctx and an empty payload as an empty object", () => {
    expect(readStartCtx("")).toEqual({});
    expect(readPayload("")).toEqual({});
  });

  test("read the start ctx as an object literal, and file what cannot be read under it", () => {
    expect(readStartCtx("{ fuel: 1, }")).toEqual({ fuel: 1 });

    const thrown = refusal(() => readStartCtx("{ fuel: }"));
    expect(thrown.field).toBe("startCtx");
    expect(thrown.message).toBe("the start ctx cannot be read: expected a value at column 9");
  });

  test("refuse a payload that is not an object", () => {
    const thrown = refusal(() => readPayload("[1]"));
    expect(thrown.field).toBe("payload");
    expect(thrown.message).toBe("the payload must be an object");
  });

  test("read dt as a number, and refuse what is not one", () => {
    expect(readDt("0.5")).toBe(0.5);

    for (const text of ["", "abc"]) {
      const thrown = refusal(() => readDt(text));
      expect(thrown.field).toBe("dt");
      expect(thrown.message).toBe("dt must be a number");
    }
  });
});

describe("fieldError", () => {
  test("returns the message of the field's reader, and nothing for text that reads", () => {
    expect(fieldError("payload", "{enter: }")).toBe(
      "the payload cannot be read: expected a value at column 9",
    );
    expect(fieldError("payload", "{enter: true}")).toBeUndefined();
  });
});
