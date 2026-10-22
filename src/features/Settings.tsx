import { useState } from "react";
import { useAction, adminApi, Page, Input, Form, Field } from "./shared";
import type { OperatorContextValue } from "@/operator/types";
export default function Settings({
  selectedCourtId,
  selectedCourt,
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
  if (!court)
    return (
      <Page title="Venue settings">
        <p>Select a venue first.</p>
      </Page>
    );
  return (
    <Page title="Venue settings">
      {action.feedback}
      <Field label="Allow half-hour bookings">
        <input
          type="checkbox"
          checked={court.allow_half_hour_bookings ?? true}
          disabled={action.busy}
          onChange={(e) => {
            void action.run(() =>
              adminApi.patch(
                `/admin/courts/${selectedCourtId}/half-hour-bookings`,
                { allow_half_hour_bookings: e.target.checked },
              ),
            );
          }}
        />
      </Field>
      <Form
        busy={action.busy}
        label="Save cancellation policy"
        onSubmit={() =>
          void action.run(() =>
            adminApi.patch(
              `/admin/courts/${selectedCourtId}/late-cancel-window`,
              { late_cancel_strike_window_minutes: Number(minutes) },
            ),
          )
        }
      >
        <div className="form-section-heading">
          <div>
            <h3>Cancellation policy</h3>
            <p>
              Late player cancellations within this window can receive a strike.
              Use 0 to disable the window.
            </p>
          </div>
        </div>
        <Input
          label="Late cancellation strike window (minutes)"
          type="number"
          min="0"
          value={minutes}
          set={setMinutes}
          required
        />
      </Form>
      <Form
        busy={action.busy}
        label="Save venue location"
        onSubmit={() =>
          void action.run(() =>
            adminApi.patch(`/admin/courts/${selectedCourtId}/maps-link`, {
              google_maps_link: maps.trim(),
            }),
          )
        }
      >
        <div className="form-section-heading">
          <div>
            <h3>Venue location</h3>
            <p>
              Paste a Google Maps share link so players can get directions to
              your venue.
            </p>
          </div>
        </div>
        <Input
          label="Google Maps share link"
          type="url"
          value={maps}
          set={setMaps}
          required
        />
      </Form>
    </Page>
  );
}
