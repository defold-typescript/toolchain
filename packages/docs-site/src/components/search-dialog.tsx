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

export type DocsSearchDialogProps = Pick<
  DefaultSearchDialogProps,
  "api" | "delayMs" | "open" | "onOpenChange"
>;

// fumadocs-ui's default dialog passes no search options to its client, so the
// site renders its own to ask for typo tolerance.
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
  return (
    <SearchDialog {...search} open={open} onOpenChange={onOpenChange}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}
