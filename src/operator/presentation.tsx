import { Link } from "react-router-dom";
import { displayTime } from "./date";
import type { OperatorGame } from "./types";

export const statusLabel = (value: string) =>
  value === "confirmed"
    ? "Upcoming"
    : value?.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const fullDate = (value: string, timeZone: string) =>
  new Date(value).toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status}`}>
      {statusLabel(status)}
    </span>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="person-avatar" aria-hidden="true">
      {(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
export function GameRow({
  game,
  timeZone,
}: {
  game: OperatorGame;
  timeZone: string;
}) {
  return (
    <Link className="game-row" to={`/games/${game.id}`}>
      <div className="game-row-top">
        <strong>{displayTime(game.starts_at, timeZone)}</strong>
        <StatusBadge status={game.status} />
      </div>
      <span className="game-row-title">
        {game.court_name || "Game"}
        <span aria-hidden="true">↗</span>
      </span>
      <span className="game-row-meta">
        {fullDate(game.starts_at, timeZone)} · Up to {game.max_players}{" "}
        {game.max_players === 1 ? "player" : "players"}
      </span>
      {!!game.flagged_player_count && (
        <span className="attention-note">
          {game.flagged_player_count} players with strikes
        </span>
      )}
    </Link>
  );
}
export function Pagination({
  offset,
  size,
  more,
  set,
}: {
  offset: number;
  size: number;
  more: boolean;
  set: (offset: number) => void;
}) {
  if (!offset && !more) return null;
  return (
    <nav className="list-pagination" aria-label="Pagination">
      <button
        disabled={!offset}
        onClick={() => set(Math.max(0, offset - size))}
      >
        ← Previous
      </button>
      <span>Page {Math.floor(offset / size) + 1}</span>
      <button disabled={!more} onClick={() => set(offset + size)}>
        Next →
      </button>
    </nav>
  );
}
