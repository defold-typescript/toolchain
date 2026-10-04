import { useEffect, useState } from "react";
import { Panel } from "react-resizable-panels";
import type { ReloadMessage } from "../src/hsm-view-server";
import { Bar } from "./bar";
import { CtxTree } from "./ctx-tree";
import { CodeArea } from "./layouts";
import { LogPane } from "./log-pane";
import { Handle, SavedGroup } from "./panels";
import { createViewerStore, useViewer, type ViewerStore } from "./store";

function useServerEvents(store: ViewerStore): void {
  useEffect(() => {
    const { load, reloaded, setDisconnected, setPlaying } = store.getState();
    void load();
    const source = new EventSource("/api/events");
    source.addEventListener("reload", (event) => {
      void reloaded(JSON.parse(event.data) as ReloadMessage);
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
  const error = useViewer(store, (state) => state.error);
  const messages = [
    disconnected ? "disconnected - run hsm-view again" : undefined,
    reloadError === undefined
      ? undefined
      : `reload failed, showing the last good load: ${reloadError}`,
    halted === undefined ? undefined : `halted: ${halted} - Start to run again`,
    error,
  ].filter((message): message is string => message !== undefined);
  if (messages.length === 0) {
    return null;
  }
  return (
    <div role="alert" className="border-rule border-b px-2 py-1 text-syntax-keyword">
      {messages.map((message) => (
        <p key={message} className="whitespace-pre-wrap">
          {message}
        </p>
      ))}
    </div>
  );
}

export function App() {
  const [store] = useState(createViewerStore);
  useServerEvents(store);

  return (
    <main className="flex h-screen flex-col bg-page font-mono text-ink text-sm leading-5">
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
                <CtxTree store={store} />
              </Panel>
            </SavedGroup>
          </Panel>
          <Handle orientation="vertical" />
          <Panel id="log" defaultSize="25" minSize="10">
            <LogPane store={store} />
          </Panel>
        </SavedGroup>
      </div>
    </main>
  );
}
