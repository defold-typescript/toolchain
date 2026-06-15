import { htmlToDocText } from "@defold-typescript/types";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";

export default createRoute((c) => {
  const pages = apiPages();
  return c.render(
    <article class="prose">
      <h1>API reference</h1>
      <p>Generated from the default Defold version's reference documentation.</p>
      <ul class="api-index">
        {pages.map((page) => (
          <li>
            <a href={page.route}>{page.namespace}</a>
            {page.brief ? <span class="api-brief"> — {htmlToDocText(page.brief)}</span> : null}
          </li>
        ))}
      </ul>
    </article>,
    { title: "API reference" },
  );
});
