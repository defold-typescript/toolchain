import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import type { InstanceView, SystemSnapshot } from "../src/hsm-view-session";
import type { EntityView } from "../src/view-worlds";
import { EntityTree } from "./entity-tree";
import { useViewer, type ViewerStore } from "./store";

const COLUMNS = "grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem_3.5rem_3.5rem] gap-x-2 px-2";

const millis = (value: number): string => value.toFixed(2);

function noteOf(system: SystemSnapshot): string {
  return [
    system.active ? undefined : "inactive",
    system.interval === undefined ? undefined : `every ${system.interval} s`,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
}

function Entity({
  store,
  entity,
  instance,
}: {
  store: ViewerStore;
  entity: EntityView;
  instance: InstanceView | undefined;
}) {
  const follow = useViewer(store, (state) => state.follow);
  return (
    <div data-entity={entity.id} className="py-0.5">
      <div className="flex gap-2">
        <span className="font-bold">entity {entity.id}</span>
        {instance !== undefined && (
          <button
            type="button"
            data-machine={instance.id}
            title={`follow this ${instance.machine} instance on the Machines tab`}
            className="cursor-pointer text-primary underline decoration-dotted underline-offset-2"
            onClick={() => void follow(instance.id)}
          >
            {instance.label}
          </button>
        )}
      </div>
      <EntityTree value={entity.value} />
    </div>
  );
}

function SystemEntities({ store, system }: { store: ViewerStore; system: SystemSnapshot }) {
  const entities = useViewer(store, (state) => state.snapshot?.entities);
  const instances = useViewer(store, (state) => state.snapshot?.instances);
  const byId = useMemo(
    () => new Map((entities ?? []).map((entity) => [entity.id, entity])),
    [entities],
  );
  const shown = (system.entities ?? []).flatMap((id) => {
    const entity = byId.get(id);
    return entity === undefined ? [] : [entity];
  });
  return (
    <div data-system-entities={system.index} className="border-border border-b py-1 pr-2 pl-8">
      {system.entities === undefined ? (
        <p className="text-muted-foreground">a nocache system keeps no entity list</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">no entities</p>
      ) : (
        shown.map((entity) => (
          <Entity
            key={entity.id}
            store={store}
            entity={entity}
            instance={
              entity.machine === undefined
                ? undefined
                : instances?.find((instance) => instance.id === entity.machine)
            }
          />
        ))
      )}
    </div>
  );
}

function SystemRow({ store, system }: { store: ViewerStore; system: SystemSnapshot }) {
  const open = useViewer(store, (state) => state.openSystems.has(system.index));
  const selected = useViewer(store, (state) => state.selectedSystem === system.index);
  const toggleSystem = useViewer(store, (state) => state.toggleSystem);
  const showSystemSource = useViewer(store, (state) => state.showSystemSource);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [selected]);
  const Caret = open ? CaretDownIcon : CaretRightIcon;
  return (
    <>
      <div
        ref={rowRef}
        data-system={system.index}
        aria-current={selected}
        className={`relative ${COLUMNS} ${selected ? "bg-accent" : ""}`}
      >
        {/* Covers the row, so a click anywhere but the name opens the entities. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`entities of ${system.name}`}
          className="absolute inset-0 cursor-pointer"
          onClick={() => toggleSystem(system.index)}
        />
        <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
          <Caret className="size-3 shrink-0" aria-hidden="true" />
          <span data-cell="index">{system.index}</span>
        </span>
        <span className="min-w-0 truncate">
          <span data-cell="name">
            <button
              type="button"
              title="show its definition in the code"
              className="relative cursor-pointer underline decoration-dotted underline-offset-2"
              onClick={() => showSystemSource(system.index)}
            >
              {system.name}
            </button>
          </span>{" "}
          <span data-cell="note" className="text-muted-foreground">
            {noteOf(system)}
          </span>
        </span>
        <span data-cell="count" className="text-right tabular-nums">
          {system.entities === undefined ? "-" : system.entities.length}
        </span>
        <span data-cell="ms" className="text-right tabular-nums">
          {millis(system.ms)}
        </span>
        <span data-cell="avg" className="text-right tabular-nums">
          {millis(system.avgMs)}
        </span>
      </div>
      {open && <SystemEntities store={store} system={system} />}
    </>
  );
}

/** The picked world's systems in index order; a row opens its entities, its name its definition. */
export function WorldsPanel({ store }: { store: ViewerStore }) {
  const world = useViewer(store, (state) => state.snapshot?.world);
  const systems = useViewer(store, (state) => state.snapshot?.systems) ?? [];

  if (world === undefined) {
    return <p className="p-2 text-muted-foreground">No world. The file creates none.</p>;
  }
  return (
    <div className="h-full overflow-auto py-1">
      <div className={`${COLUMNS} border-border border-b text-muted-foreground`}>
        <span>#</span>
        <span>system</span>
        <span className="text-right" title="entities the system holds">
          count
        </span>
        <span className="text-right" title="milliseconds in the last frame">
          ms
        </span>
        <span className="text-right" title="average milliseconds per frame">
          avg
        </span>
      </div>
      {systems.length === 0 ? (
        <p className="p-2 text-muted-foreground">{world} has no systems.</p>
      ) : (
        systems.map((system) => <SystemRow key={system.index} store={store} system={system} />)
      )}
    </div>
  );
}
