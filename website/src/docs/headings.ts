import { Children, isValidElement, type ReactNode } from "react";

export type DocHeading = {
  id: string;
  text: string;
  level: number;
};

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];

  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (!match) continue;

    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;

    headings.push({
      level: match[1].length,
      text,
      id: slugifyHeading(text),
    });
  }

  return headings;
}

export function getTextFromChildren(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getTextFromChildren(child.props.children);
      }
      return "";
    })
    .join("");
}
