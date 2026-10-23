import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { adminApi } from "@/api/client";
import { OperatorListSkeleton, QueryError } from "./ui";
import { Avatar } from "./presentation";
export default function OperatorPlayers() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const usersQuery = useQuery({
    queryKey: ["operator-users", search],
    queryFn: ({ signal }) =>
      adminApi.get<
        Array<{
          id: string;
          name: string;
          username: string;
          strike_count?: number;
        }>
      >(`/users/search?q=${encodeURIComponent(search)}`, signal),
    enabled: search.length >= 2,
  });
  const users = usersQuery.data ?? [];
  return (
    <section className="operator-page directory-page">
      <header className="overview-heading">
        <p className="section-eyebrow">YOUR COMMUNITY</p>
        <h2>Players</h2>
        <p>Find a player and review their record.</p>
      </header>
      <label className="operator-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Search players"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or username"
        />
      </label>
      <section className="surface-section" aria-label="Player search results">
        {usersQuery.isError ? (
          <QueryError retry={() => void usersQuery.refetch()} />
        ) : usersQuery.isFetching ? (
          <OperatorListSkeleton />
        ) : search.length < 2 ? (
          <div className="quiet-state">
            <strong>Who are you looking for?</strong>
            <p>Enter at least two characters to search for a player.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="quiet-state">
            <strong>No matching players</strong>
            <p>Try another name or username.</p>
          </div>
        ) : (
          <div className="people-list">
            {users.map((user) => (
              <Link
                className="person-row"
                key={user.id}
                to={`/players/${user.id}?name=${encodeURIComponent(user.name)}`}
              >
                <Avatar name={user.name} />
                <div>
                  <strong>{user.name}</strong>
                  <span>@{user.username}</span>
                  {!!user.strike_count && (
                    <span className="attention-note">
                      {user.strike_count} strikes
                    </span>
                  )}
                </div>
                <span className="row-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
