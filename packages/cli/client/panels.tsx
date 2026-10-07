import type { ReactNode } from "react";
import { Group, Separator, useDefaultLayout } from "react-resizable-panels";

/** A resizable group whose sizes the browser remembers under `id` between visits. */
export function SavedGroup({
  id,
  orientation,
  children,
}: {
  id: string;
  orientation: "horizontal" | "vertical";
  children: ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id });
  return (
    <Group
      id={id}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-full"
    >
      {children}
    </Group>
  );
}

export function Handle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return (
    <Separator
      className={`bg-border hover:bg-primary ${orientation === "horizontal" ? "w-1" : "h-1"}`}
    />
  );
}
