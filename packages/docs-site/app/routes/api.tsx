import { createRoute } from "honox/factory";
import { ApiIndex } from "../components/api-index";
import { apiPages } from "../lib/api-content";

export default createRoute((c) => {
  return c.render(<ApiIndex pages={apiPages()} />, { title: "API reference" });
});
