import { createRoute } from "honox/factory";
import { LibraryIndex } from "../components/api-index";
import { apiPages, libraryOrigins } from "../lib/api-content";

export default createRoute((c) => {
  return c.render(<LibraryIndex pages={apiPages()} origins={libraryOrigins()} />, {
    title: "Libraries",
  });
});
