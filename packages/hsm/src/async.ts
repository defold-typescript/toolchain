import type { EventObject, TaskStart } from "./index";

/**
 * The second argument of a `sequence` function: a wait that leaving the state cancels, and a flag
 * that tells the state was left.
 * @noSelf
 */
export interface SequenceSignal {
  /**
   * Turns `true` once the state is left. Check it after awaiting anything other than `wait`: such
   * a promise can still resolve after the state is left, and the code after it then runs.
   */
  readonly aborted: boolean;
  /**
   * Resolves after `seconds`, counted by `timer.delay` rather than by `update(dt)`. A wait still
   * pending when the state is left never resolves, so the code after it does not run.
   */
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

// The sequence plugs into the state's task, so its cleanup cancels the pending
// waits on every way out of the state; a wait left pending is never resolved.
/**
 * Turns an `async` function into a state's `task`. The function gets the context and a
 * `SequenceSignal`, and the event it returns is sent to the machine; one returned after the state
 * is left is ignored. An error thrown inside it leaves the machine where it is and is raised
 * again from a timer callback, so it shows in the engine console.
 */
export function sequence<Ctx, E extends EventObject>(
  // biome-ignore lint/suspicious/noConfusingVoidType: `void` lets a sequence end without returning an event.
  run: (ctx: Ctx, signal: SequenceSignal) => Promise<NoInfer<E> | void>,
): TaskStart<Ctx, E> {
  return (ctx, finish) => {
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
          finish(event);
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
