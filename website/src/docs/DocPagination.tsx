import { Link } from "react-router-dom";
import { getDocNeighbors } from "./sidebar";

type DocPaginationProps = {
  slug: string;
};

export function DocPagination({ slug }: DocPaginationProps) {
  const { prev, next } = getDocNeighbors(slug);
  if (!prev && !next) return null;

  return (
    <nav className="docs-pagination" aria-label="Documentation pages">
      {prev ? (
        <Link className="docs-pagination-card prev" to={`/docs/${prev.slug}`}>
          <span className="docs-pagination-label">Previous</span>
          <span className="docs-pagination-title">« {prev.label}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <Link className="docs-pagination-card next" to={`/docs/${next.slug}`}>
          <span className="docs-pagination-label">Next</span>
          <span className="docs-pagination-title">{next.label} »</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
