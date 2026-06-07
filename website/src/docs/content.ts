const docFiles = import.meta.glob("../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function docKey(slug: string) {
  return `../../docs/${slug}.md`;
}

export function getDocMarkdown(slug: string): string | undefined {
  return docFiles[docKey(slug)];
}

export function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("---", 3);
  if (end === -1) return raw;
  return raw.slice(end + 3).trimStart();
}

export function resolveDocHref(href: string | undefined, currentSlug: string): string | undefined {
  if (!href) return href;
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) {
    return href;
  }
  if (href.startsWith("/docs/")) return href;
  if (href.startsWith("/")) return href;

  let path = href.replace(/\.md$/, "").replace(/\.mdx$/, "");
  const currentDir = currentSlug.includes("/")
    ? currentSlug.slice(0, currentSlug.lastIndexOf("/") + 1)
    : "";

  if (path.startsWith("./")) {
    path = currentDir + path.slice(2);
  } else if (path.startsWith("../")) {
    const parts = currentDir.split("/").filter(Boolean);
    while (path.startsWith("../")) {
      path = path.slice(3);
      parts.pop();
    }
    path = [...parts, path].join("/");
  } else if (currentDir && !path.includes("/")) {
    path = currentDir + path;
  }

  return `/docs/${path}`;
}
