import { useEffect, useState } from "react";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export default function PwaStatus() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("install-hint-dismissed") === "true",
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    matchMedia("(display-mode: standalone)").matches,
  );
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    setInstalling(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      setPrompt(null);
      setInstalling(false);
    }
  }
  return (
    <>
      {!online && (
        <div className="pwa-status" role="status">
          You’re offline. Displayed information may be out of date.
        </div>
      )}
      {!installed && !dismissed && (
        <aside className="pwa-install">
          <span>
            Add Ekamuthu Admin to your home screen.
            {!prompt &&
              " In Chrome, open the menu and choose Install app or Add to Home screen."}
          </span>
          {prompt && (
            <button onClick={install} disabled={installing}>
              Install app
            </button>
          )}
          <button
            className="pwa-dismiss"
            aria-label="Dismiss installation hint"
            onClick={() => {
              setDismissed(true);
              sessionStorage.setItem("install-hint-dismissed", "true");
            }}
          >
            ×
          </button>
        </aside>
      )}
    </>
  );
}
