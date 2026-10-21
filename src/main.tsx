import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "@/Toast";
import App from "./App";
import PwaStatus from "./PwaStatus";
import "./index.css";

class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="operator-boot">
        <h1>Could not open this screen</h1>
        <p>Reconnect and reload to try again.</p>
        <button onClick={() => window.location.reload()}>Reload app</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <>
      <PwaStatus />
      <AppBoundary>
        <App />
      </AppBoundary>
      <Toaster />
    </>
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.warn("Offline support unavailable", error));
  });
}
