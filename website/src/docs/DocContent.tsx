import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getDocMarkdown, resolveDocHref, stripFrontmatter } from "./content";
import { getTextFromChildren, slugifyHeading } from "./headings";
import { DocPagination } from "./DocPagination";

type DocContentProps = {
  slug: string;
};

function makeHeading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as const;

  return function DocHeading({ children }: { children?: React.ReactNode }) {
    const text = getTextFromChildren(children);
    const id = slugifyHeading(text);
    return <Tag id={id}>{children}</Tag>;
  };
}

export function DocContent({ slug }: DocContentProps) {
  const raw = getDocMarkdown(slug);
  if (!raw) {
    return (
      <div className="doc-content">
        <h1>Page not found</h1>
        <p>
          No documentation page at <code>{slug}</code>.{" "}
          <Link to="/docs/intro">Go to introduction</Link>.
        </p>
      </div>
    );
  }

  const markdown = stripFrontmatter(raw);

  return (
    <>
      <article className="doc-content markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: makeHeading(2),
            h3: makeHeading(3),
            h4: makeHeading(4),
            a: ({ href, children }) => {
              const resolved = resolveDocHref(href, slug);
              if (resolved?.startsWith("/docs/")) {
                return <Link to={resolved}>{children}</Link>;
              }
              if (resolved?.startsWith("/")) {
                return <a href={resolved}>{children}</a>;
              }
              return (
                <a href={resolved} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
      <DocPagination slug={slug} />
    </>
  );
}
