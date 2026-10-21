import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
export function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <article className={cn("operator-metric", `tone-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="operator-panel">
      <div className="operator-panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function OperatorBootScreen({ title }: { title: string }) {
  return (
    <div className="operator-boot">
      <div className="operator-loader" />
      <strong>{title}</strong>
    </div>
  );
}

export function OperatorListSkeleton() {
  return (
    <div className="operator-list">
      {[0, 1, 2].map((item) => (
        <div key={item} className="operator-skeleton-row">
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="operator-calendar-skeleton">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <span key={item} />
      ))}
    </div>
  );
}

export function QueryError({ retry }: { retry?: () => void }) {
  const client = useQueryClient();
  return (
    <div className="operator-panel" role="alert">
      <p>
        Could not load this information. Check your connection and try again.
      </p>
      <button
        className="operator-action"
        onClick={() =>
          retry ? retry() : void client.refetchQueries({ type: "active" })
        }
      >
        Try again
      </button>
    </div>
  );
}
