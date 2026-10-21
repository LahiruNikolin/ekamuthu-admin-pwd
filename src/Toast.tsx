import { useEffect, useState } from "react";
const show = (message: string) =>
  window.dispatchEvent(new CustomEvent("admin-message", { detail: message }));
export const toast = { success: show, error: show };
export function Toaster() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 6000);
    };
    window.addEventListener("admin-message", handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("admin-message", handler);
    };
  }, []);
  return message ? (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 12,
        left: 16,
        right: 16,
        zIndex: 100,
        background: "#0f172a",
        color: "white",
        padding: 16,
        borderRadius: 8,
      }}
      onClick={() => setMessage("")}
    >
      {message}
    </div>
  ) : null;
}
