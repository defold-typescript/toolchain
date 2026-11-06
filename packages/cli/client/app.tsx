import { useEffect, useState } from "react";
import { Panel } from "react-resizable-panels";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { LiveMessage } from "../src/hsm-view-live";
import type { HsmViewTab, ReloadMessage } from "../src/hsm-view-server";
import { Bar } from "./bar";
import { CtxTree } from "./ctx-tree";
import { CodeArea } from "./layouts";
import { LogPane } from "./log-pane";
import { Handle, SavedGroup } from "./panels";
import {
  createViewerStore,
  DISCONNECTED,
  offersBothTabs,
  shownTab,
  useViewer,
  type ViewerStore,
} from "./store";
import { WorldsPanel } from "./worlds-panel";

function useServerEvents(store: ViewerStore): void {
  useEffect(() => {
    const { load, receiveLive, reloaded, setDisconnected, setPlaying } = store.getState();
    void load();
    const source = new EventSource("/api/events");
    source.addEventListener("reload", (event) => {
      void reloaded(JSON.parse(event.data) as ReloadMessage);
    });
    source.addEventListener("live", (event) => {
      void receiveLive(JSON.parse(event.data) as LiveMessage);
    });
    source.addEventListener("error", () => {
      source.close();
      setPlaying(false);
      setDisconnected(true);
    });
    return () => source.close();
  }, [store]);
}

function Banner({ store }: { store: ViewerStore }) {
  const disconnected = useViewer(store, (state) => state.disconnected);
  const reloadError = useViewer(store, (state) => state.reloadError);
  const halted = useViewer(store, (state) => state.snapshot?.error);
  const liveBanner = useViewer(store, (state) => state.live.banner);
  const messages = [
    liveBanner,
    disconnected ? DISCONNECTED : undefined,
    reloadError === undefined
      ? undefined
      : `reload failed, showing the last good load: ${reloadError}`,
    halted === undefined ? undefined : `halted: ${halted} - Start to run again`,
  ].filter((message): message is string => message !== undefined);
  if (messages.length === 0) {
    return null;
  }
  return (
    <div role="alert" className="border-border border-b px-2 py-1 text-destructive">
      {messages.map((message) => (
        <p key={message} className="whitespace-pre-wrap">
          {message}
        </p>
      ))}
    </div>
  );
}

const TAB_LABEL: Readonly<Record<HsmViewTab, string>> = { machines: "Machines", worlds: "Worlds" };

/** The panel beside the code: the ctx tree on the Machines tab, the systems on the Worlds tab. */
export function SidePanel({ store }: { store: ViewerStore }) {
  const tab = useViewer(store, shownTab);
  const both = useViewer(store, offersBothTabs);
  const setTab = useViewer(store, (state) => state.setTab);
  return (
    <div className="flex h-full flex-col">
      {both && (
        <div role="tablist" aria-label="side panel" className="flex border-border border-b">
          {(["machines", "worlds"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === tab}
              className={`cursor-pointer px-3 py-1 ${option === tab ? "border-primary border-b-2 font-bold" : "text-muted-foreground"}`}
              onClick={() => setTab(option)}
            >
              {TAB_LABEL[option]}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {tab === "machines" ? <CtxTree store={store} /> : <WorldsPanel store={store} />}
      </div>
    </div>
  );
}

export function App() {
  const [store] = useState(() => createViewerStore({ notify: (message) => toast.error(message) }));
  useServerEvents(store);

  return (
    <main className="flex h-screen flex-col bg-background font-mono text-foreground text-sm leading-5">
      <Bar store={store} />
      <Banner store={store} />
      <div className="min-h-0 flex-1">
        <SavedGroup id="hsm-view-main" orientation="vertical">
          <Panel id="top" minSize="20">
            <SavedGroup id="hsm-view-top" orientation="horizontal">
              <Panel id="code" minSize="20">
                <CodeArea store={store} />
              </Panel>
              <Handle orientation="horizontal" />
              <Panel id="ctx" defaultSize="25" minSize="10">
                <SidePanel store={store} />
              </Panel>
            </SavedGroup>
          </Panel>
          <Handle orientation="vertical" />
          <Panel id="log" defaultSize="25" minSize="10">
            <LogPane store={store} />
          </Panel>
        </SavedGroup>
      </div>
      <Toaster />
    </main>
  );
}
