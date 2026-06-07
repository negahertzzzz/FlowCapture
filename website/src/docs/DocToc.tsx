import { useEffect, useMemo, useState } from "react";
import { getDocMarkdown, stripFrontmatter } from "./content";
import { extractHeadings } from "./headings";

type DocTocProps = {
  slug: string;
};

export function DocToc({ slug }: DocTocProps) {
  const headings = useMemo(() => {
    const raw = getDocMarkdown(slug);
    if (!raw) return [];
    return extractHeadings(stripFrontmatter(raw));
  }, [slug]);

  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (headings.length === 0) return;

    const updateActive = () => {
      const offset = 96;
      let current = headings[0]?.id ?? "";

      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= offset) {
          current = heading.id;
        }
      }

      setActiveId(current);
    };

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => window.removeEventListener("scroll", updateActive);
  }, [headings, slug]);

  if (headings.length === 0) return null;

  return (
    <aside className="docs-toc" aria-label="On this page">
      <div className="docs-toc-title">On this page</div>
      <nav className="docs-toc-nav">
        <ul className="docs-toc-list">
          {headings.map((heading) => (
            <li
              key={heading.id}
              className={`docs-toc-item level-${heading.level}${activeId === heading.id ? " active" : ""}`}
            >
              <a
                href={`#${heading.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth" });
                  setActiveId(heading.id);
                }}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
