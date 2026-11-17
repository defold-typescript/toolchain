"use client";
import { SidebarTabsDropdown } from "fumadocs-ui/components/sidebar/tabs/dropdown";
import { useDocsLayout } from "fumadocs-ui/layouts/docs";

/**
 * The sidebar's section switcher on wide screens, listing the same tabs as the
 * top row. With the tabs across the top, Fumadocs keeps only tabs bound to
 * named root folders in the wide sidebar's switcher, which drops every one of
 * these; the phone drawer already lists them all, so this stays out of it.
 */
export function SectionDropdown() {
  const { tabs } = useDocsLayout().props;
  if (tabs.length === 0) return null;
  return (
    <div data-section-dropdown="" className="flex flex-col max-md:hidden">
      <SidebarTabsDropdown options={tabs} />
    </div>
  );
}
