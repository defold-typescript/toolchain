import type { ReactNode } from "react";
import { LayoutToggle } from "./layouts";
import { SearchBox } from "./search-box";
import { SPEEDS, useViewer, type ViewerStore } from "./store";

const BUTTON = "cursor-pointer border border-rule px-2 disabled:cursor-default disabled:opacity-50";
const FIELD = "border border-rule bg-page px-1";

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset's border and legend do not fit a one-line bar
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  );
}

const speedLabel = (speed: number): string => (speed === 1 ? "1x" : `${speed}x`);

/** The controls fixed at the top of the page. */
export function Bar({ store }: { store: ViewerStore }) {
  const machines = useViewer(store, (state) => state.index?.machines);
  const picked = useViewer(store, (state) => state.snapshot?.picked);
  const running = useViewer(store, (state) => state.snapshot?.running ?? false);
  const accepts = useViewer(store, (state) => state.snapshot?.accepts);
  const t = useViewer(store, (state) => state.snapshot?.t ?? 0);
  const leaves = useViewer(store, (state) => state.snapshot?.leaves);
  const startCtx = useViewer(store, (state) => state.startCtx);
  const payload = useViewer(store, (state) => state.payload);
  const dt = useViewer(store, (state) => state.dt);
  const speed = useViewer(store, (state) => state.speed);
  const playing = useViewer(store, (state) => state.playing);
  const instances = useViewer(store, (state) => state.live.instances);
  const attached = useViewer(store, (state) => state.live.attached);
  const simulating = attached === undefined;
  const actions = store.getState();

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-rule border-b px-2 py-1">
      <Group label="machine">
        <select
          aria-label="machine"
          className={FIELD}
          value={picked ?? ""}
          onChange={(event) => {
            actions.setPlaying(false);
            void actions.pick(event.target.value);
          }}
        >
          {(machines ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label="start ctx"
          className={`${FIELD} w-40`}
          value={startCtx}
          onChange={(event) => actions.setStartCtx(event.target.value)}
        />
        <button
          type="button"
          className={BUTTON}
          disabled={!simulating}
          onClick={() => void actions.start()}
        >
          Start
        </button>
      </Group>
      <Group label="live">
        <select
          aria-label="live instance"
          title="an inspected instance of the game running from the editor"
          className={FIELD}
          value={attached ?? ""}
          onChange={(event) => {
            const label = event.target.value;
            if (label === "") {
              void actions.detach();
            } else {
              actions.attach(label);
            }
          }}
        >
          <option value="">live: off</option>
          {instances.map((instance) => (
            <option key={instance.label} value={instance.label}>
              {instance.stopped ? `${instance.label} (stopped)` : instance.label}
            </option>
          ))}
        </select>
      </Group>
      <Group label="events">
        {(accepts ?? []).map((type) => (
          <button
            key={type}
            type="button"
            className={BUTTON}
            disabled={!simulating}
            onClick={() => void actions.send(type)}
          >
            {type}
          </button>
        ))}
        <input
          aria-label="payload"
          placeholder="payload JSON"
          className={`${FIELD} w-32`}
          value={payload}
          onChange={(event) => actions.setPayload(event.target.value)}
        />
      </Group>
      <Group label="time">
        <button
          type="button"
          className={BUTTON}
          disabled={!running || !simulating}
          onClick={() => actions.setPlaying(!playing)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!running || playing || !simulating}
          onClick={() => void actions.step()}
        >
          Step
        </button>
        <input
          aria-label="dt"
          className={`${FIELD} w-14`}
          value={dt}
          onChange={(event) => actions.setDt(event.target.value)}
        />
        <select
          aria-label="speed"
          className={FIELD}
          value={speed}
          onChange={(event) => actions.setSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((option) => (
            <option key={option} value={option}>
              {speedLabel(option)}
            </option>
          ))}
        </select>
        <span className="tabular-nums">t={t.toFixed(2)}</span>
      </Group>
      <span className="min-w-0 truncate text-muted" title="active leaves">
        {(leaves ?? []).join(", ")}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <SearchBox store={store} />
        <LayoutToggle store={store} />
      </div>
    </header>
  );
}
