import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi, APIError } from "@/api/client";
export { adminApi };
export type RecordData = Record<string, any>;
export function useData<T = RecordData[]>(path: string, enabled = true) {
  return useQuery({
    queryKey: ["data", path],
    queryFn: ({ signal }) => adminApi.get<T>(path, signal),
    enabled,
  });
}
export function useAction() {
  const client = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(
    action: () => Promise<unknown>,
    success: string | ((result: any) => string) = "Saved",
    done?: () => void,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      await client.invalidateQueries();
      setMessage(typeof success === "function" ? success(result) : success);
      done?.();
      return true;
    } catch (e) {
      setError(
        e instanceof Error &&
          !(e instanceof TypeError) &&
          e.name !== "TimeoutError" &&
          e.name !== "AbortError"
          ? e.message
          : "The response was lost. Refresh to check whether the change was saved before trying again.",
      );
      void client.invalidateQueries();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    run,
    busy,
    feedback: (
      <>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </>
    ),
  };
}
export function Page({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="operator-page">
      <Link to="/venue">← Venue</Link>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Load({
  query,
}: {
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
}) {
  return query.isLoading ? (
    <p role="status">Loading…</p>
  ) : query.isError ? (
    <p role="alert">
      Could not load. <button onClick={() => query.refetch()}>Retry</button>
    </p>
  ) : null;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{ id?: string; "aria-label"?: string }>,
            { id, "aria-label": label },
          )
        : children}
    </div>
  );
}
export function Input({
  label,
  value,
  set,
  type = "text",
  required = false,
  min,
  max,
  step,
}: {
  label: string;
  value: string | number;
  set: (v: string) => void;
  type?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </Field>
  );
}
export function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Checks({
  label,
  options,
  value,
  set,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  set: (v: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="checks">
        {options.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={value.includes(o.id)}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? [...value, o.id]
                    : value.filter((x) => x !== o.id),
                )
              }
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Form({
  children,
  onSubmit,
  busy,
  label = "Save",
}: {
  children: ReactNode;
  onSubmit: () => void;
  busy: boolean;
  label?: string;
}) {
  return (
    <form
      className="edit-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="operator-action primary" type="submit">
          {busy ? "Saving…" : label}
        </button>
      </fieldset>
    </form>
  );
}
export function Contact({ phone, name }: { phone?: string; name?: string }) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return (
    <div>
      <strong>{name}</strong>
      {digits && (
        <p>
          <a href={`tel:${digits}`}>Call {phone}</a> ·{" "}
          <a
            href={`https://wa.me/${digits.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        </p>
      )}
    </div>
  );
}
export const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
  (name, i) => ({ id: String(i + 1), name }),
);
export const statusLabel = (value: string) =>
  value === "confirmed" ? "Upcoming" : value?.replaceAll("_", " ");

export function changeSummary(prefix: string, result: RecordData = {}) {
  const fields: [string, string][] = [["created", "times generated"], ["skipped", "times skipped"], ["cancelled_games", "games cancelled"], ["cancelled_slots", "times cancelled"], ["price_notified_games", "game prices updated"], ["replaced_templates", "previous schedules suspended"]];
  const details = fields.filter(([key]) => Number(result?.[key]) > 0).map(([key, label]) => `${result[key]} ${label}`);
  return prefix + (details.length ? ": " + details.join(", ") : "");
}
