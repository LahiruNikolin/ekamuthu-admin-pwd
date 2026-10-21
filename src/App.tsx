import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
const Legal = lazy(() => import("./features/Legal"));
const OperatorApp = lazy(() => import("./operator/OperatorApp"));
import Login from "./pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <main className="operator-boot" role="status">
            Opening venue…
          </main>
        }
      >
        <Routes>
          <Route path="/privacy" element={<Legal />} />
          <Route path="/terms" element={<Legal />} />
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<OperatorApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
