import BrowserPush, { removeBrowserPush } from "./BrowserPush";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Form,
  Input,
  Load,
  type RecordData,
} from "./shared";
import { logout } from "@/lib/auth";
export default function Account() {
  const profile = useData<RecordData>("/users/me");
  const action = useAction();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  return (
    <Page title="Account" backTo="/" backLabel="Dashboard">
      <Load query={profile} />
      {profile.data && (
        <article className="feature-card">
          <h3>{profile.data.name}</h3>
          <p>
            {profile.data.email} · {profile.data.role === "sys_admin" ? "System administrator" : "Court administrator"}
          </p>
        </article>
      )}
      {action.feedback}
      <nav className="actions">
        <Link to="/notifications">Notifications</Link>
        <Link to="/settings">Venue settings</Link>
        <Link to="/promotions">Promotions</Link>
        <Link to="/privacy">Privacy policy</Link>
        <Link to="/terms">Terms of service</Link>
      </nav>
      <BrowserPush />
      <details>
        <summary>Change password</summary>
        <Form
          busy={action.busy}
          label="Change password"
          onSubmit={() =>
            void action.run(
              () => {
                if (password.length < 8)
                  throw new Error("Use at least 8 characters.");
                if (password !== repeat)
                  throw new Error("Passwords do not match.");
                if (password === current)
                  throw new Error("Choose a different new password.");
                return adminApi.patch("/auth/password", {
                  current_password: current,
                  new_password: password,
                });
              },
              "Password changed",
              () => {
                setCurrent("");
                setPassword("");
                setRepeat("");
              },
            )
          }
        >
          <Input
            label="Current password"
            type="password"
            value={current}
            set={setCurrent}
            required
          />
          <Input
            label="New password"
            type="password"
            value={password}
            set={setPassword}
            required
          />
          <Input
            label="Repeat new password"
            type="password"
            value={repeat}
            set={setRepeat}
            required
          />
        </Form>
      </details>
      <button
        className="operator-action danger"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await removeBrowserPush();
            await logout();
            client.clear();
            navigate("/login", { replace: true });
          }, "Signed out")
        }
      >
        Sign out
      </button>
    </Page>
  );
}
