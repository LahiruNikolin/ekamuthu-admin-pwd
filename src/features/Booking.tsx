import { toast } from "@/Toast";
import { confirmAction as confirm } from "@/confirm";
import { useEffect, useState } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Select,
  Contact,
  Field,
  statusLabel,
  type RecordData,
} from "./shared";
import { localISO, localInput, colomboDateKey, displayTime } from "@/operator/date";
import type { OperatorContextValue } from "@/operator/types";
export default function Booking(ctx: OperatorContextValue) {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const date =
    params.get("date") ||
    colomboDateKey(new Date(), ctx.selectedCourt?.timezone || "Asia/Colombo");
  return (
    <Page title={bookingId ? "Booking details" : "New booking or blocked time"}>
      <Link
        to={`/calendar?date=${date}&playAreaId=${params.get("playAreaId") || ""}`}
      >
        ← Calendar
      </Link>
      {bookingId ? (
        <BookingDetails
          bookingId={bookingId}
          courtId={ctx.selectedCourtId}
          date={date}
          playAreaId={params.get("playAreaId") || ""}
          zone={ctx.selectedCourt?.timezone || "Asia/Colombo"}
        />
      ) : (
        <BookingForm {...ctx} date={date} />
      )}
    </Page>
  );
}

// Shared by direct links and the calendar dialog; mutations retain the same API contracts.
export function BookingDetails({
  bookingId,
  courtId,
  date,
  playAreaId,
  zone,
  onReleased,
}: {
  bookingId: string;
  courtId: string;
  date: string;
  playAreaId: string;
  zone: string;
  onReleased?: () => void;
}) {
  const data = useData(
    `/admin/calendar/days?court_id=${courtId}&start_date=${date}&days=1${playAreaId ? `&play_area_id=${playAreaId}` : ""}`,
    !!bookingId && !!courtId,
  );
  const block = data.data?.find(
    (b) =>
      b.id === bookingId ||
      b.flexible_booking_id === bookingId ||
      b.recurring_booking_id === bookingId,
  );
  return (
    <>
      <Load query={data} />
      {block ? (
        <BookingDetail
          key={`${block.id}-${block.status}-${block.admin_contact_phone}`}
          block={block}
          blocks={data.data || []}
          zone={zone}
          onReleased={onReleased}
        />
      ) : (
        !data.isLoading &&
        !data.isError && (
          <p>
            This booking is no longer on this date. Close the details and
            refresh the calendar to check its latest state.
          </p>
        )
      )}
    </>
  );
}

function BookingForm({
  selectedCourtId,
  selectedCourt,
  date,
}: OperatorContextValue & { date: string }) {
  const location = useLocation();
  const [search] = useSearchParams();
  const initialItems = (
    location.state as {
      items?: { play_area_id: string; starts_at: string; ends_at: string }[];
    } | null
  )?.items;
  const areas = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const action = useAction();
  const zone = selectedCourt?.timezone || "Asia/Colombo";
  const [kind, setKind] = useState("booking");
  const [items, setItems] = useState(
    initialItems?.length
      ? initialItems.map((item) => ({
          play_area_id: item.play_area_id,
          start: localInput(item.starts_at, zone),
          end: localInput(item.ends_at, zone),
        }))
      : [
          {
            play_area_id: search.get("playAreaId") || "",
            start: `${date}T08:00`,
            end: `${date}T09:00`,
          },
        ],
  );
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lookupPhone, setLookupPhone] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setLookupPhone(phone.trim()), 350);
    return () => clearTimeout(timer);
  }, [phone]);
  const lookup = useData<RecordData>(
    `/admin/players/lookup?phone=${encodeURIComponent(lookupPhone)}`,
    lookupPhone.replace(/\D/g, "").length >= 9 && kind !== "block",
  );
  useEffect(() => {
    if (lookup.data?.found && lookupPhone === phone.trim())
      setName((n) => n || lookup.data?.player?.name || "");
  }, [lookup.data, lookupPhone, phone]);
  useEffect(() => {
    if (areas.data?.length)
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          play_area_id: item.play_area_id || areas.data![0].id,
        })),
      );
  }, [areas.data]);
  function itemSet(i: number, key: string, value: string) {
    setItems((prev) =>
      prev.map((item, n) => (n === i ? { ...item, [key]: value } : item)),
    );
  }
  async function save() {
    await action.run(
      () => {
        const ranges = items.map((item) => ({
          play_area_id: item.play_area_id,
          starts_at: localISO(item.start, zone),
          ends_at: localISO(item.end, zone),
        }));
        for (const item of ranges)
          if (
            !item.play_area_id ||
            Date.parse(item.ends_at) <= Date.parse(item.starts_at)
          )
            throw new Error("Choose an area and an end after the start.");
        const contact =
          kind === "block"
            ? {}
            : {
                admin_contact_phone: phone.trim(),
                admin_contact_name: name.trim(),
              };
        const common = {
          court_id: selectedCourtId,
          note: note.trim(),
          reservation_purpose: kind === "block" ? "block" : "booking",
          ...contact,
        };
        if (ranges.length > 1)
          return adminApi.post("/admin/reservations/batch", {
            ...common,
            items: ranges,
          });
        if (kind === "historical") {
          if (Date.parse(ranges[0].ends_at) > Date.now())
            throw new Error("Historical games must end in the past.");
          return adminApi.post("/admin/games/historical", {
            ...common,
            ...ranges[0],
            max_players: 1,
            offline_players: 1,
            client_request_id: requestId,
          });
        }
        return adminApi.post(
          kind === "weekly"
            ? "/admin/recurring-reservations"
            : "/admin/reservations",
          { ...common, ...ranges[0] },
        );
      },
      kind === "weekly"
        ? "Weekly booking started. Future weeks are being protected in the background."
        : "Calendar updated",
      () => setRequestId(crypto.randomUUID()),
    );
  }
  return (
    <>
      <Load query={areas} />
      {action.feedback}
      <p>All times use {zone}.</p>
      <Form busy={action.busy} label="Create" onSubmit={() => void save()}>
        <Select
          label="Action"
          value={kind}
          set={(v) => {
            setKind(v);
            if (v === "weekly" || v === "historical")
              setItems(items.slice(0, 1));
          }}
          options={["booking", "block", "weekly", "historical"].map((id) => ({
            id,
            name: {
              booking: "One-time booking",
              block: "Block time",
              weekly: "Weekly booking",
              historical: "Record historical game",
            }[id]!,
          }))}
        />
        {items.map((item, i) => (
          <section className="feature-card" key={i}>
            <Select
              label={`Play area ${i + 1}`}
              value={item.play_area_id}
              set={(v) => itemSet(i, "play_area_id", v)}
              options={(areas.data || []).map((a) => ({
                id: a.id,
                name: a.name,
              }))}
            />
            <Input
              label="Start"
              type="datetime-local"
              value={item.start}
              set={(v) => itemSet(i, "start", v)}
              required
            />
            <Input
              label="End"
              type="datetime-local"
              min={item.start}
              value={item.end}
              set={(v) => itemSet(i, "end", v)}
              required
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setItems(items.filter((_, n) => n !== i))}
              >
                Remove range
              </button>
            )}
          </section>
        ))}
        {["booking", "block"].includes(kind) && (
          <button
            type="button"
            onClick={() => setItems([...items, { ...items[items.length - 1] }])}
          >
            Add another area/time
          </button>
        )}
        {kind !== "block" && (
          <>
            <Input
              label="Customer phone"
              type="tel"
              value={phone}
              set={setPhone}
            />
            <Input label="Customer name" value={name} set={setName} />
            {lookup.isFetching ? (
              <p>Looking up player…</p>
            ) : lookup.data?.found ? (
              <p>
                Matched player: {lookup.data.player.name}. This booking will be
                linked to their account.
              </p>
            ) : (
              lookup.data && (
                <p>
                  No registered player found; customer contact will be saved.
                </p>
              )
            )}
            {lookup.isError && (
              <p role="alert">Player lookup failed. Check the phone number.</p>
            )}
          </>
        )}
        <Input label="Note" value={note} set={setNote} />
      </Form>
    </>
  );
}
function BookingDetail({
  block: b,
  blocks,
  zone,
  onReleased,
}: {
  block: RecordData;
  blocks: RecordData[];
  zone: string;
  onReleased?: () => void;
}) {
  const navigate = useNavigate();
  const fields = [
    "court_id",
    "play_area_id",
    "status",
    "booking_type",
    "reservation_purpose",
    "reservation_note",
    "admin_contact_phone",
    "admin_contact_name",
    "admin_assigned_player_id",
    "recurring_booking_id",
    "flexible_booking_id",
  ];
  let releaseStart = b.starts_at,
    releaseEnd = b.ends_at;
  if (!b.is_flexible) {
    const matching = blocks.filter(
      (x) =>
        !x.is_flexible &&
        !x.locked_by_game &&
        !x.is_derived_blocker &&
        x.status === "reserved" &&
        fields.every((k) => (x[k] || "") === (b[k] || "")),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const x of matching) {
        if (Date.parse(x.ends_at) === Date.parse(releaseStart)) {
          releaseStart = x.starts_at;
          changed = true;
        }
        if (Date.parse(x.starts_at) === Date.parse(releaseEnd)) {
          releaseEnd = x.ends_at;
          changed = true;
        }
      }
    }
  }

  const action = useAction();
  const [phone, setPhone] = useState(b.admin_contact_phone || "");
  const [name, setName] = useState(b.admin_contact_name || "");
  const [start, setStart] = useState(localInput(releaseStart, zone));
  const [end, setEnd] = useState(localInput(releaseEnd, zone));
  const [reason, setReason] = useState("");
  const [advertise, setAdvertise] = useState(false);
  const active = !["cancelled", "expired"].includes(b.status);
  const derived = !!b.is_derived_blocker;
  const release = active && !derived && b.status === "reserved";
  const weekly =
    active && !derived && !!b.recurring_booking_id && !b.admin_outcome;
  const contactPath =
    b.recurring_booking_kind === "admin_reservation" && b.recurring_booking_id
      ? `/admin/recurring-reservations/${b.recurring_booking_id}/contact`
      : b.is_flexible
        ? `/admin/flexible-reservations/${b.flexible_booking_id || b.id}/contact`
        : `/admin/reservations/${b.id}/contact`;
  async function confirmed(
    message: string,
    path: string,
    body: RecordData = {},
  ) {
    if (await confirm(message))
      void action.run(() => adminApi.patch(path, body), "Calendar updated");
  }
  return (
    <>
      {action.feedback}
      <article className="feature-card">
        <h3>
          {b.play_area_name} · {b.is_recurring ? "Weekly booking" : statusLabel(b.admin_outcome || b.game_status || b.status)}
        </h3>
        <p>
          {new Date(b.starts_at).toLocaleDateString("en", { timeZone: zone, weekday: "short", month: "short", day: "numeric", year: "numeric" })}<br />
          {displayTime(b.starts_at, zone)} – {displayTime(b.ends_at, zone)}{colomboDateKey(new Date(b.starts_at), zone) !== colomboDateKey(new Date(b.ends_at), zone) ? " (next day)" : ""}
          <small className="booking-detail-zone">{zone.replaceAll("_", " ")}</small>
        </p>
        <p>
          LKR {Number(b.price || 0).toLocaleString()}{b.reservation_note ? ` · ${b.reservation_note}` : ""}
        </p>
        <Contact
          phone={b.admin_contact_phone || b.booking_creator?.phone}
          name={b.admin_contact_name || b.booking_creator?.name}
        />
        {b.admin_assigned_player && (
          <p>Assigned: {b.admin_assigned_player.name}</p>
        )}
        {b.locked_by_game && (
          <Link to={`/games/${b.locked_by_game}`}>
            Game details and player actions
          </Link>
        )}
        {derived && <p>Blocked by {b.blocking_source_play_area_name}</p>}
      </article>
      {((release && b.reservation_purpose === "booking") ||
        (weekly && b.recurring_booking_kind === "admin_reservation")) && (
        <Form
          busy={action.busy}
          label="Save contact"
          onSubmit={() =>
            void action.run(
              () =>
                adminApi.patch(contactPath, {
                  admin_contact_phone: phone,
                  admin_contact_name: name,
                }),
              "Contact updated",
            )
          }
        >
          <Input
            label="Customer phone"
            type="tel"
            value={phone}
            set={setPhone}
          />
          <Input label="Customer name" value={name} set={setName} />
          <button
            type="button"
            onClick={async () => {
              setPhone("");
              setName("");
            }}
          >
            Clear contact fields
          </button>
        </Form>
      )}
      {release && (
        <Form
          busy={action.busy}
          label="Release selected time"
          onSubmit={async () => {
            if (
              !(await confirm(
                "Release this time? Remaining portions will stay blocked.",
              ))
            )
              return;
            void action.run(
              () => {
                const starts_at = localISO(start, zone),
                  ends_at = localISO(end, zone);
                if (
                  Date.parse(starts_at) < Date.parse(releaseStart) ||
                  Date.parse(ends_at) > Date.parse(releaseEnd) ||
                  ends_at <= starts_at
                )
                  throw new Error("Release must stay inside this booking.");
                return adminApi.patch(
                  b.is_flexible
                    ? `/admin/flexible-reservations/${b.flexible_booking_id || b.id}/release`
                    : `/admin/slots/${b.id}/release`,
                  { starts_at, ends_at },
                );
              },
              "Time released",
              () => {
                toast.success("Time released");
                if (onReleased) {
                  onReleased();
                  return;
                }
                navigate(
                  `/calendar?date=${colomboDateKey(new Date(b.starts_at), zone)}&playAreaId=${b.play_area_id || ""}`,
                );
              },
            );
          }}
        >
          <Input
            label="Release start"
            type="datetime-local"
            value={start}
            set={setStart}
            required
          />
          <Input
            label="Release end"
            type="datetime-local"
            value={end}
            set={setEnd}
            required
          />
        </Form>
      )}
      {active && !derived && b.status === "available" && (
        <Link
          className="operator-action"
          to={`/bookings/new?date=${colomboDateKey(new Date(b.starts_at), zone)}`}
          state={{
            items: [
              {
                play_area_id: b.play_area_id,
                starts_at: b.starts_at,
                ends_at: b.ends_at,
              },
            ],
          }}
        >
          Book or block this time
        </Link>
      )}
      <div className="actions">
        {active && !derived && ["available", "held"].includes(b.status) && (
          <button
            disabled={action.busy}
            onClick={() =>
              confirmed(
                "Cancel this available time?",
                `/admin/slots/${b.id}/cancel`,
              )
            }
          >
            Cancel time
          </button>
        )}
        {b.locked_by_game &&
          ["confirmed", "ongoing"].includes(b.game_status) && (
            <button
              disabled={action.busy}
              onClick={() =>
                confirmed(
                  "Cancel game and notify players?",
                  `/admin/games/${b.locked_by_game}/cancel`,
                  { reason: "Cancelled by court admin" },
                )
              }
            >
              Cancel game
            </button>
          )}
        {b.locked_by_game &&
          ["ongoing", "completed"].includes(b.game_status) && (
            <button
              disabled={action.busy}
              onClick={() =>
                confirmed(
                  "Mark game no-show?",
                  `/admin/games/${b.locked_by_game}/status`,
                  { status: "no_show" },
                )
              }
            >
              Mark no-show
            </button>
          )}
        {!b.locked_by_game &&
          !derived &&
          b.is_flexible &&
          b.reservation_purpose === "booking" &&
          b.admin_outcome !== "no_show" &&
          Date.parse(b.ends_at) <= Date.now() &&
          ["reserved", "expired", "recurring_reserved"].includes(b.status) && (
            <button
              disabled={action.busy}
              onClick={() =>
                confirmed(
                  "Mark booking no-show?",
                  `/admin/flexible-reservations/${b.flexible_booking_id || b.id}/outcome`,
                  { outcome: "no_show" },
                )
              }
            >
              Mark booking no-show
            </button>
          )}
        {weekly && !b.locked_by_game && b.recurring_occurrence_id && (
          <button
            disabled={action.busy}
            onClick={() =>
              confirmed(
                "Skip only this week?",
                `/admin/recurring-reservations/occurrences/${b.recurring_occurrence_id}/skip`,
              )
            }
          >
            Skip this week
          </button>
        )}
        {weekly && (
          <button
            disabled={action.busy}
            onClick={() =>
              confirmed(
                "End weekly series? Future holds will be released in the background. Existing games can be cancelled separately.",
                `/admin/recurring-reservations/${b.recurring_booking_id}/cancel`,
              )
            }
          >
            End weekly series
          </button>
        )}
      </div>
      {derived && b.can_override_blocker && b.blocking_source_play_area_id && (
        <Form
          busy={action.busy}
          label="Allow this time"
          onSubmit={() =>
            void action.run(
              () =>
                adminApi.post("/admin/blocking-overrides", {
                  court_id: b.court_id,
                  blocked_play_area_id: b.play_area_id,
                  source_play_area_id: b.blocking_source_play_area_id,
                  starts_at: b.starts_at,
                  ends_at: b.ends_at,
                  advertise_to_players: advertise,
                  reason,
                }),
              "Blocking override created",
            )
          }
        >
          <Input
            label="Override reason"
            value={reason}
            set={setReason}
            required
          />
          <Field label="Advertise this time to players">
            <input
              type="checkbox"
              checked={advertise}
              onChange={(e) => setAdvertise(e.target.checked)}
            />
          </Field>
        </Form>
      )}
      {b.blocking_override_id && (
        <button
          disabled={action.busy}
          onClick={async () => {
            if (await confirm("Remove override and restore normal blocking?"))
              void action.run(
                () =>
                  adminApi.delete(
                    `/admin/blocking-overrides/${b.blocking_override_id}`,
                  ),
                "Override removed",
              );
          }}
        >
          Remove override
        </button>
      )}
    </>
  );
}
