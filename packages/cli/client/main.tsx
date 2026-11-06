import { createRoot } from "react-dom/client";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("view: the page has no #root element");
}
createRoot(root).render(<App />);
