import { useLocation, Link } from "react-router-dom";
import docs from "./legal.json";
export default function Legal() {
  const kind = useLocation().pathname.includes("privacy") ? "privacy" : "terms";
  return (
    <main className="operator-main">
      <Link to="/account">← Account</Link>
      <h1>{kind === "privacy" ? "Privacy policy" : "Terms of service"}</h1>
      {docs[kind].map((b, i) =>
        b.kind === "heading" ? (
          <h2 key={i}>{b.text}</h2>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </main>
  );
}
