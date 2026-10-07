import { parseLiteral } from "./literal";

export type FieldName = "startCtx" | "payload" | "dt";

/** A bar field's text that its reader refused; the message is what the page shows. */
export class InputError extends Error {
  readonly field: FieldName;

  constructor(field: FieldName, message: string) {
    super(message);
    this.field = field;
  }
}

function readLiteral(field: FieldName, what: string, text: string): unknown {
  if (text.trim() === "") {
    return {};
  }
  try {
    return parseLiteral(text);
  } catch (thrown) {
    throw new InputError(field, `${what} cannot be read: ${(thrown as Error).message}`);
  }
}

export function readStartCtx(text: string): unknown {
  return readLiteral("startCtx", "the start ctx", text);
}

export function readPayload(text: string): Record<string, unknown> {
  const payload = readLiteral("payload", "the payload", text);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new InputError("payload", "the payload must be an object");
  }
  return payload as Record<string, unknown>;
}

export function readDt(text: string): number {
  const dt = Number(text);
  if (text.trim() === "" || !Number.isFinite(dt)) {
    throw new InputError("dt", "dt must be a number");
  }
  return dt;
}

const READERS: Record<FieldName, (text: string) => unknown> = {
  startCtx: readStartCtx,
  payload: readPayload,
  dt: readDt,
};

/** The message of the field's reader for `text`, or `undefined` when the text reads. */
export function fieldError(field: FieldName, text: string): string | undefined {
  try {
    READERS[field](text);
    return undefined;
  } catch (thrown) {
    if (thrown instanceof InputError) {
      return thrown.message;
    }
    throw thrown;
  }
}
