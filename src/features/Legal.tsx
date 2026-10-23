import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import docsURL from "./legal.json?url";
export default function Legal() {
  const kind = useLocation().pathname.includes("privacy") ? "privacy" : "terms";
  const [docs, setDocs] = useState<Record<
    string,
    { kind: string; text: string }[]
  > | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(docsURL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setDocs)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <main className="operator-main">
      <Link className="feature-back" to="/account">
        ← Back to Account
      </Link>
      <h1>{kind === "privacy" ? "Privacy policy" : "Terms of service"}</h1>
      {error ? (
        <p role="alert">
          Could not load this document.{" "}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      ) : !docs ? (
        <p role="status">Loading document…</p>
      ) : (
        docs[kind].map((b, i) =>
          b.kind === "heading" ? (
            <h2 key={i}>{b.text}</h2>
          ) : (
            <p key={i}>{b.text}</p>
          ),
        )
      )}
    </main>
  );
}
