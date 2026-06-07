import { BrowserRouter, Route, Routes } from "react-router-dom";
import DocsLayout from "./docs/DocsLayout";
import LandingPage from "./pages/LandingPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/docs/*" element={<DocsLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
