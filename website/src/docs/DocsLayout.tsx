import { Navigate, useLocation } from "react-router-dom";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { DocContent } from "./DocContent";
import { DocSidebar } from "./DocSidebar";
import { DocToc } from "./DocToc";

export default function DocsLayout() {
  const location = useLocation();
  const slug = location.pathname.replace(/^\/docs\/?/, "") || "intro";

  if (location.pathname === "/docs" || location.pathname === "/docs/") {
    return <Navigate to="/docs/intro" replace />;
  }

  return (
    <>
      <Nav variant="docs" />
      <div className="docs-shell">
        <DocSidebar />
        <div className="docs-body">
          <main className="docs-main">
            <DocContent slug={slug} />
          </main>
          <DocToc slug={slug} />
        </div>
      </div>
      <Footer variant="docs" />
    </>
  );
}
