import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeAuth } from "@/lib/auth";
import {
  useAction,
  adminApi,
  Page,
  Input,
  Form,
  Field,
  Select,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
export default function Settings({
  selectedCourtId,
  selectedCourt,
  courts,
  setSelectedCourtId,
}: OperatorContextValue) {
  const court = selectedCourt as typeof selectedCourt & {
    allow_half_hour_bookings?: boolean;
    late_cancel_strike_window_minutes?: number;
  };
  const [maps, setMaps] = useState(court?.address || "");
  const [minutes, setMinutes] = useState(
    String(court?.late_cancel_strike_window_minutes ?? 60),
  );
  const action = useAction();
  return (
    <Page title="Venue settings">
      {action.feedback}
      <section className="settings-venue-card">
        <div className="settings-section-title">
          <span className="settings-symbol" aria-hidden="true">
            ⌂
          </span>
          <div>
            <h3>Your venue</h3>
            <p>Choose the venue you want to manage across the app.</p>
          </div>
        </div>
        <Select
          label="Selected venue"
          value={selectedCourtId || "__all__"}
          set={setSelectedCourtId}
          options={[
            ...courts.map((c) => ({ id: c.id, name: c.name })),
            ...(decodeAuth().role === "sys_admin"
              ? [{ id: "__all__", name: "All venues · overview" }]
              : []),
          ]}
        />
        <div className="settings-venue-meta">
          <span
            className={`settings-status ${court?.is_active === false ? "is-draft" : ""}`}
          >
            {court
              ? court.is_active === false
                ? "Draft venue"
                : "Published venue"
              : "All venues"}
          </span>
          <span>
            {court?.timezone?.replaceAll("_", " ") ||
              "Times local to each venue"}
          </span>
        </div>
      </section>
      {!court ? (
        <section className="feature-empty">
          <h3>Select a venue to edit its settings</h3>
          <p>
            All venues shows combined calendar and reports. Choose an individual
            venue above to manage its booking rules and location.
          </p>
        </section>
      ) : (
        <>
          <section className="settings-card">
            <div className="settings-section-title">
              <span className="settings-symbol" aria-hidden="true">
                ◷
              </span>
              <div>
                <h3>Booking preferences</h3>
                <p>Control how players reserve time at {court.name}.</p>
              </div>
            </div>
            <label className="settings-toggle">
              <div>
                <strong>Half-hour bookings</strong>
                <p>Allow bookings in 30-minute increments.</p>
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-label="Allow half-hour bookings"
                checked={court.allow_half_hour_bookings ?? true}
                disabled={action.busy}
                onChange={(e) =>
                  void action.run(
                    () =>
                      adminApi.patch(
                        `/admin/courts/${selectedCourtId}/half-hour-bookings`,
                        { allow_half_hour_bookings: e.target.checked },
                      ),
                    "Booking preferences saved",
                  )
                }
              />
            </label>
          </section>
          <Form
            busy={action.busy}
            label="Save cancellation policy"
            onSubmit={() =>
              void action.run(
                () =>
                  adminApi.patch(
                    `/admin/courts/${selectedCourtId}/late-cancel-window`,
                    { late_cancel_strike_window_minutes: Number(minutes) },
                  ),
                "Cancellation policy saved",
              )
            }
          >
            <div className="settings-section-title">
              <span className="settings-symbol" aria-hidden="true">
                ↶
              </span>
              <div>
                <h3>Cancellation policy</h3>
                <p>Set when a late player cancellation may receive a strike.</p>
              </div>
            </div>
            <Input
              label="Late cancellation window (minutes)"
              type="number"
              min="0"
              value={minutes}
              set={setMinutes}
              required
            />
            <p className="form-hint">
              For example, 60 applies within one hour of the game. Set to 0 to
              disable the window.
            </p>
          </Form>
          <Form
            busy={action.busy}
            label="Save venue location"
            onSubmit={() =>
              void action.run(
                () =>
                  adminApi.patch(`/admin/courts/${selectedCourtId}/maps-link`, {
                    google_maps_link: maps.trim(),
                  }),
                "Venue location saved",
              )
            }
          >
            <div className="settings-section-title">
              <span className="settings-symbol" aria-hidden="true">
                ⌖
              </span>
              <div>
                <h3>Venue location</h3>
                <p>Help players get directions straight to your venue.</p>
              </div>
            </div>
            <Input
              label="Google Maps share link"
              type="url"
              placeholder="https://maps.app.goo.gl/…"
              value={maps}
              set={setMaps}
              required
            />
            {court.address && (
              <a
                className="settings-map-link"
                href={court.address}
                target="_blank"
                rel="noreferrer"
              >
                View current location ↗
              </a>
            )}
          </Form>
          <div className="settings-footer-link">
            <span>Need to update your play areas, templates or photos?</span>
            <Link to="/venue">Manage venue →</Link>
          </div>
        </>
      )}
    </Page>
  );
}
