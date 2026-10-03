import type { EventObject, InvokeStart } from "./index";

/** @noSelf */
export interface SequenceSignal {
  readonly aborted: boolean;
  readonly wait: (seconds: number) => Promise<void>;
}

/** @noSelf */
interface Signal {
  aborted: boolean;
  readonly wait: (seconds: number) => Promise<void>;
}

function forget(handles: number[], handle: number): void {
  for (let i = 0; i < handles.length; i++) {
    if (handles[i] === handle) {
      handles[i] = handles[handles.length - 1] as number;
      handles.pop();
      return;
    }
  }
}

// A rejected sequence promise has no reader, so its error would vanish; a fresh
// timer callback raises it where the engine logs it.
function rethrow(reason: unknown): void {
  timer.delay(0, false, () => {
    throw reason;
  });
}

// The sequence plugs into the state's invoke, so its cleanup cancels the pending
// waits on every way out of the state; a wait left pending is never resolved.
export function sequence<Ctx, E extends EventObject>(
  // biome-ignore lint/suspicious/noConfusingVoidType: `void` lets a sequence end without returning an event.
  run: (ctx: Ctx, signal: SequenceSignal) => Promise<NoInfer<E> | void>,
): InvokeStart<Ctx, E> {
  return (ctx, settle) => {
    const handles: number[] = [];
    const signal: Signal = {
      aborted: false,
      wait: (seconds) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) {
            return;
          }
          handles.push(
            timer.delay(seconds, false, (_self, handle) => {
              forget(handles, handle);
              if (!signal.aborted) {
                resolve();
              }
            }),
          );
        }),
    };
    run(ctx, signal).then(
      (event) => {
        if (event !== undefined) {
          settle(event);
        }
      },
      (reason) => rethrow(reason),
    );
    return () => {
      signal.aborted = true;
      while (handles.length > 0) {
        timer.cancel(handles.pop() as number);
      }
    };
  };
}
