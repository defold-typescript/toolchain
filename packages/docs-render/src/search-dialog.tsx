"use client";
import { useStaticSearch } from "fumadocs-core/search/client/orama-static";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from "fumadocs-ui/components/dialog/search";
import type { DefaultSearchDialogProps } from "fumadocs-ui/components/dialog/search-default";
import { useMemo } from "react";
import { searchExcerpt } from "./snippet";

export type DocsSearchDialogProps = Pick<
  DefaultSearchDialogProps,
  "api" | "delayMs" | "open" | "onOpenChange"
>;

type SearchData = NonNullable<ReturnType<typeof useStaticSearch>["data"]>;

// fumadocs-ui renders a text hit's whole content, which for a guide section or an
// API member can run to thousands of characters. Each text hit shows the passage
// around the query instead; without its parsed `hastContent` the list renders the
// excerpt as plain text.
function excerptItems(data: SearchData) {
  return data.items.map((item) => {
    if (item.type !== "text") return item;
    const { hastContent: _parsed, ...record } = item;
    return { ...record, content: searchExcerpt(record.content, data.query) };
  });
}

// fumadocs-ui's default dialog passes no search options to its client, so both
// sites render this one to ask for typo tolerance.
export default function DocsSearchDialog({
  api,
  delayMs,
  open,
  onOpenChange,
}: DocsSearchDialogProps) {
  const search = useStaticSearch({
    ...(api === undefined ? {} : { from: api }),
    ...(delayMs === undefined ? {} : { delayMs }),
    search: { tolerance: 1 },
  });
  const { data } = search;
  const items = useMemo(() => (data ? excerptItems(data) : null), [data]);
  return (
    <SearchDialog {...search} open={open} onOpenChange={onOpenChange}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={items} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
