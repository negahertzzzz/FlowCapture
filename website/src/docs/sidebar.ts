export type DocNavItem =
  | { type: "doc"; slug: string; label: string }
  | { type: "category"; label: string; collapsed?: boolean; items: DocNavItem[] };

export const docsSidebar: DocNavItem[] = [
  { type: "doc", slug: "intro", label: "Introduction" },
  {
    type: "category",
    label: "Getting Started",
    items: [
      { type: "doc", slug: "getting-started/installation", label: "Installation" },
      { type: "doc", slug: "getting-started/quick-start", label: "Quick Start" },
      { type: "doc", slug: "getting-started/permissions", label: "Permissions" },
    ],
  },
  {
    type: "category",
    label: "User Guide",
    items: [
      { type: "doc", slug: "guide/recording", label: "Recording" },
      { type: "doc", slug: "guide/sessions-and-timeline", label: "Sessions & Timeline" },
      { type: "doc", slug: "guide/ai-documentation", label: "AI Documentation" },
      { type: "doc", slug: "guide/exports", label: "Exports" },
      { type: "doc", slug: "guide/settings-and-privacy", label: "Settings & Privacy" },
    ],
  },
  {
    type: "category",
    label: "Development",
    items: [
      { type: "doc", slug: "development/local-setup", label: "Local Setup" },
      { type: "doc", slug: "development/project-structure", label: "Project Structure" },
      { type: "doc", slug: "development/testing", label: "Testing" },
      { type: "doc", slug: "development/cross-platform", label: "Cross-Platform Notes" },
    ],
  },
  {
    type: "category",
    label: "Reference",
    items: [
      { type: "doc", slug: "reference/ai-providers", label: "AI Providers" },
      { type: "doc", slug: "reference/export-formats", label: "Export Formats" },
      { type: "doc", slug: "reference/keyboard-shortcuts", label: "Keyboard Shortcuts" },
    ],
  },
  {
    type: "category",
    label: "Quality",
    items: [{ type: "doc", slug: "quality/dogfooding", label: "Dogfooding" }],
  },
  {
    type: "category",
    label: "Project",
    items: [
      { type: "doc", slug: "project/product-requirements", label: "Product Requirements" },
      { type: "doc", slug: "project/technical-architecture", label: "Technical Architecture" },
    ],
  },
];

export function flattenDocSlugs(items: DocNavItem[] = docsSidebar): string[] {
  return flattenDocLinks(items).map((link) => link.slug);
}

export type DocLink = {
  slug: string;
  label: string;
};

export function flattenDocLinks(items: DocNavItem[] = docsSidebar): DocLink[] {
  const links: DocLink[] = [];
  for (const item of items) {
    if (item.type === "doc") links.push({ slug: item.slug, label: item.label });
    else links.push(...flattenDocLinks(item.items));
  }
  return links;
}

export function getDocNeighbors(slug: string): { prev?: DocLink; next?: DocLink } {
  const links = flattenDocLinks();
  const index = links.findIndex((link) => link.slug === slug);
  if (index === -1) return {};

  return {
    prev: index > 0 ? links[index - 1] : undefined,
    next: index < links.length - 1 ? links[index + 1] : undefined,
  };
}
