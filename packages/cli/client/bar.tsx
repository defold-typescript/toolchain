import { PauseIcon, PlayIcon, PowerIcon, SkipForwardIcon } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type FieldName, fieldError } from "./fields";
import { JsonDialog } from "./json-dialog";
import { LayoutToggle } from "./layouts";
import { SearchBox } from "./search-box";
import { SPEEDS, useViewer, type ViewerStore } from "./store";

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset's border and legend do not fit a one-line bar
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {children}
    </div>
  );
}

const speedLabel = (speed: number): string => (speed === 1 ? "1x" : `${speed}x`);

const FIELDS = ["startCtx", "payload", "dt"] as const satisfies readonly FieldName[];

const errorId = (name: FieldName): string => `bar-error-${name}`;

/** The controls fixed at the top of the page. */
export function Bar({ store }: { store: ViewerStore }) {
  const machines = useViewer(store, (state) => state.index?.machines);
  const picked = useViewer(store, (state) => state.snapshot?.picked);
  const running = useViewer(store, (state) => state.snapshot?.running ?? false);
  const accepts = useViewer(store, (state) => state.snapshot?.accepts);
  const t = useViewer(store, (state) => state.snapshot?.t ?? 0);
  const leaves = useViewer(store, (state) => state.snapshot?.leaves);
  const speed = useViewer(store, (state) => state.speed);
  const playing = useViewer(store, (state) => state.playing);
  const instances = useViewer(store, (state) => state.live.instances);
  const attached = useViewer(store, (state) => state.live.attached);
  const simulating = attached === undefined;
  const actions = store.getState();
  const setters = {
    startCtx: actions.setStartCtx,
    payload: actions.setPayload,
    dt: actions.setDt,
  } satisfies Record<FieldName, (text: string) => void>;
  const [defaultValues] = useState(() => {
    const { startCtx, payload, dt } = store.getState();
    return { startCtx, payload, dt };
  });
  const form = useForm({ defaultValues });

  const input = (name: FieldName, props: ComponentProps<typeof Input>) => (
    <form.Field
      name={name}
      validators={{
        onMount: ({ value }) => fieldError(name, value),
        onChange: ({ value }) => fieldError(name, value),
      }}
    >
      {(field) => (
        <Input
          {...props}
          value={field.state.value}
          aria-invalid={!field.state.meta.isValid}
          aria-describedby={field.state.meta.isValid ? undefined : errorId(name)}
          onChange={(event) => {
            field.handleChange(event.target.value);
            setters[name](event.target.value);
          }}
        />
      )}
    </form.Field>
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-border border-b bg-muted px-2 py-1">
        <Group label="machine">
          <NativeSelect
            aria-label="machine"
            size="sm"
            value={picked ?? ""}
            onChange={(event) => {
              actions.setPlaying(false);
              void actions.pick(event.target.value);
            }}
          >
            {(machines ?? []).map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {input("startCtx", { "aria-label": "start ctx", className: "h-8 w-40 px-2" })}
          <JsonDialog
            field="startCtx"
            title="Start ctx"
            confirmLabel="Start"
            disabled={!simulating}
            read={() => form.getFieldValue("startCtx")}
            onConfirm={(text) => {
              form.setFieldValue("startCtx", text);
              actions.setStartCtx(text);
              void actions.start();
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!simulating}
            onClick={() => void actions.start()}
          >
            <PowerIcon aria-hidden="true" />
            Start
          </Button>
        </Group>
        <Group label="live">
          <NativeSelect
            aria-label="live instance"
            title="an inspected instance of the game running from the editor"
            size="sm"
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
            <NativeSelectOption value="">live: off</NativeSelectOption>
            {instances.map((instance) => (
              <NativeSelectOption key={instance.label} value={instance.label}>
                {instance.stopped ? `${instance.label} (stopped)` : instance.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Group>
        <Group label="events">
          {(accepts ?? []).map((type) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="sm"
              disabled={!simulating}
              onClick={() => void actions.send(type)}
            >
              {type}
            </Button>
          ))}
          {input("payload", {
            "aria-label": "payload",
            placeholder: "payload {a: 1}",
            title: "the event's other fields, as an object literal or JSON",
            className: "h-8 w-36 px-2",
          })}
          <JsonDialog
            field="payload"
            title="Payload"
            confirmLabel="Apply"
            read={() => form.getFieldValue("payload")}
            onConfirm={(text) => {
              form.setFieldValue("payload", text);
              actions.setPayload(text);
            }}
          />
        </Group>
        <Group label="time">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!running || !simulating}
            onClick={() => actions.setPlaying(!playing)}
          >
            {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!running || playing || !simulating}
            onClick={() => void actions.step()}
          >
            <SkipForwardIcon aria-hidden="true" />
            Step
          </Button>
          {input("dt", { "aria-label": "dt", className: "h-8 w-14 px-2" })}
          <NativeSelect
            aria-label="speed"
            size="sm"
            value={speed}
            onChange={(event) => actions.setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {speedLabel(option)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <span className="tabular-nums">t={t.toFixed(2)}</span>
        </Group>
        <span className="min-w-0 truncate text-muted-foreground" title="active leaves">
          {(leaves ?? []).join(", ")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox store={store} />
          <LayoutToggle store={store} />
        </div>
      </header>
      <form.Subscribe selector={(state) => FIELDS.map((name) => state.fieldMeta[name]?.errors[0])}>
        {(errors) =>
          errors.every((error) => error === undefined) ? null : (
            <div
              role="alert"
              className="border-border border-b bg-muted px-2 py-1 text-destructive"
            >
              {FIELDS.map((name, at) =>
                errors[at] === undefined ? null : (
                  <p key={name} id={errorId(name)}>
                    {errors[at]}
                  </p>
                ),
              )}
            </div>
          )
        }
      </form.Subscribe>
    </>
  );
}
