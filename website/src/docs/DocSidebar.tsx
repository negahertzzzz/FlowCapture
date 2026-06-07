import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { docsSidebar, type DocNavItem } from "./sidebar";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`docs-sidebar-chevron${open ? " open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function categoryContainsSlug(items: DocNavItem[], slug: string): boolean {
  return items.some((item) => {
    if (item.type === "doc") return item.slug === slug;
    return categoryContainsSlug(item.items, slug);
  });
}

function SidebarLink({ slug, label, nested }: { slug: string; label: string; nested?: boolean }) {
  const location = useLocation();
  const href = `/docs/${slug}`;
  const active = location.pathname === href || location.pathname === `${href}/`;

  return (
    <Link
      className={`docs-sidebar-link${nested ? " nested" : ""}${active ? " active" : ""}`}
      to={href}
    >
      {label}
    </Link>
  );
}

function SidebarGroup({ item }: { item: Extract<DocNavItem, { type: "category" }> }) {
  const location = useLocation();
  const currentSlug = location.pathname.replace(/^\/docs\/?/, "") || "intro";
  const containsActive = categoryContainsSlug(item.items, currentSlug);
  const [open, setOpen] = useState(containsActive);

  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  return (
    <div className={`docs-sidebar-group${open ? " open" : ""}`}>
      <button
        type="button"
        className="docs-sidebar-category"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{item.label}</span>
        <Chevron open={open} />
      </button>
      <div className="docs-sidebar-items">
        {item.items.map((child) =>
          child.type === "doc" ? (
            <SidebarLink key={child.slug} slug={child.slug} label={child.label} nested />
          ) : null,
        )}
      </div>
    </div>
  );
}

export function DocSidebar() {
  return (
    <aside className="docs-sidebar" aria-label="Documentation">
      <nav className="docs-sidebar-nav">
        {docsSidebar.map((item) =>
          item.type === "doc" ? (
            <SidebarLink key={item.slug} slug={item.slug} label={item.label} />
          ) : (
            <SidebarGroup key={item.label} item={item} />
          ),
        )}
      </nav>
    </aside>
  );
}
