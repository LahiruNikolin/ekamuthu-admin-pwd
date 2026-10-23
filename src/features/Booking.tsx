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
  EmptyState,
  type RecordData,
} from "./shared";
import {
  localISO,
  localInput,
  colomboDateKey,
  displayTime,
  displayDate,
} from "@/operator/date";
import type { OperatorContextValue } from "@/operator/types";
export default function Booking(ctx: OperatorContextValue) {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  // Resolve deep links before the global venue preference effect runs.
  const requestedCourt = ctx.courts.find((c) => c.id === params.get("courtId"));
  if (requestedCourt)
    ctx = {
      ...ctx,
      selectedCourtId: requestedCourt.id,
      selectedCourt: requestedCourt,
    };
  const date =
    params.get("date") ||
    colomboDateKey(new Date(), ctx.selectedCourt?.timezone || "Asia/Colombo");
  return (
    <Page
      title={bookingId ? "Booking details" : "New booking"}
      backTo={`/calendar?date=${date}`}
      backLabel="Calendar"
    >
      {bookingId ? (
        <BookingDetails
          bookingId={bookingId}
          courtId={ctx.selectedCourtId}
          date={date}
          playAreaId={params.get("playAreaId") || ""}
          zone={ctx.selectedCourt?.timezone || "Asia/Colombo"}
        />
      ) : (
        <BookingForm key={`${ctx.selectedCourtId}:${params}`} {...ctx} date={date} />
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
  const navigate = useNavigate();
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
            start: search.get("start") || `${date}T08:00`,
            end: search.get("end") || `${date}T09:00`,
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
      prev.map((item, n) => {
        if (n !== i) return item;
        if (key === "start") {
          const duration =
            Date.parse(item.end + "Z") - Date.parse(item.start + "Z");
          const next = Date.parse(value + "Z");
          if (duration > 0 && Number.isFinite(next))
            return {
              ...item,
              start: value,
              end: new Date(next + duration).toISOString().slice(0, 16),
            };
        }
        return { ...item, [key]: value };
      }),
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
            !Number.isFinite(Date.parse(item.starts_at)) ||
            !Number.isFinite(Date.parse(item.ends_at)) ||
            Date.parse(item.ends_at) <= Date.parse(item.starts_at)
          )
            throw new Error("Choose an area and an end after the start.");
        for (let i = 0; i < ranges.length; i++)
          for (let j = i + 1; j < ranges.length; j++)
            if (
              ranges[i].play_area_id === ranges[j].play_area_id &&
              ranges[i].starts_at < ranges[j].ends_at &&
              ranges[j].starts_at < ranges[i].ends_at
            )
              throw new Error(
                "Two time ranges overlap in the same play area. Adjust or remove one before saving.",
              );
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
      () => {
        setRequestId(crypto.randomUUID());
        toast.success(
          kind === "weekly"
            ? "Weekly booking created"
            : kind === "block"
              ? "Time blocked"
              : "Booking saved",
        );
        navigate(
          `/calendar?date=${items[0].start.slice(0, 10)}&courtId=${selectedCourtId}`,
        );
      },
    );
  }
  const kinds = [
    {
      id: "booking",
      title: "One-time",
      description: "A single booking",
      icon: "01",
    },
    {
      id: "weekly",
      title: "Weekly",
      description: "Repeat every week",
      icon: "↻",
    },
    {
      id: "block",
      title: "Block time",
      description: "Keep time unavailable",
      icon: "⊘",
    },
    {
      id: "historical",
      title: "Past game",
      description: "Record a game played",
      icon: "↶",
    },
  ];
  const submitLabel =
    kind === "block"
      ? "Block time"
      : kind === "weekly"
        ? "Create weekly booking"
        : kind === "historical"
          ? "Record past game"
          : "Create booking";
  const totalMinutes = items.reduce(
    (total, item) =>
      total +
      Math.max(
        0,
        (Date.parse(item.end + "Z") - Date.parse(item.start + "Z")) / 60000 ||
          0,
      ),
    0,
  );
  function setDuration(i: number, minutes: number) {
    const start = Date.parse(items[i].start + "Z");
    if (!Number.isFinite(start)) return;
    itemSet(
      i,
      "end",
      new Date(start + minutes * 60000).toISOString().slice(0, 16),
    );
  }
  if (areas.isLoading || areas.isError) return <Load query={areas} />;
  if (!areas.data?.length)
    return (
      <EmptyState title="Add a play area first">
        Your venue needs a play area before you can create a booking.{" "}
        <Link to="/areas">Manage play areas →</Link>
      </EmptyState>
    );
  return (
    <div className="booking-create">
      <div className="booking-context">
        <span className="booking-context-dot" />{" "}
        <strong>{selectedCourt?.name}</strong>
        <span>{zone.replaceAll("_", " ")} time</span>
      </div>
      {action.feedback}
      <Form busy={action.busy} label={submitLabel} onSubmit={() => void save()}>
        <section className="booking-section">
          <div className="form-section-heading">
            <span>1</span>
            <div>
              <h3>What would you like to do?</h3>
              <p>Choose how this time should appear in your calendar.</p>
            </div>
          </div>
          <div
            className="booking-kind-options"
            role="group"
            aria-label="Booking type"
          >
            {kinds.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={kind === option.id}
                onClick={() => {
                  setKind(option.id);
                  if (["weekly", "historical"].includes(option.id))
                    setItems(items.slice(0, 1));
                }}
              >
                <span className="booking-kind-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          {kind === "weekly" && (
            <p className="form-hint">
              The same play area and time repeat each week. Future weeks are
              protected in the background.
            </p>
          )}
          {kind === "historical" && (
            <p className="form-hint">
              Choose a game that has already ended. This records it in your
              venue’s history.
            </p>
          )}
          {kind === "block" && (
            <p className="form-hint">
              This time will be unavailable for players to book.
            </p>
          )}
        </section>
        <section className="booking-section">
          <div className="form-section-heading">
            <span>2</span>
            <div>
              <h3>Play area & time</h3>
              <p>All times follow your venue’s timezone.</p>
            </div>
          </div>
          {items.map((item, i) => (
            <div className="booking-range" key={i}>
              <div className="booking-range-heading">
                <strong>
                  {items.length > 1 ? `Time range ${i + 1}` : "When & where"}
                </strong>
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove time range ${i + 1}`}
                    onClick={() => setItems(items.filter((_, n) => n !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
              <Select
                label="Play area"
                value={item.play_area_id}
                set={(v) => itemSet(i, "play_area_id", v)}
                options={(areas.data || []).map((a) => ({
                  id: a.id,
                  name: a.name,
                }))}
              />
              <div className="booking-date-row">
                <Input
                  label="Start date"
                  type="date"
                  value={item.start.slice(0, 10)}
                  set={(v) =>
                    itemSet(i, "start", `${v}T${item.start.slice(11)}`)
                  }
                  required
                />
                <Input
                  label="Start time"
                  type="time"
                  value={item.start.slice(11)}
                  set={(v) =>
                    itemSet(i, "start", `${item.start.slice(0, 10)}T${v}`)
                  }
                  required
                />
              </div>
              <div
                className="booking-duration"
                role="group"
                aria-label={`Duration for time range ${i + 1}`}
              >
                <span>Quick duration</span>
                {[60, 90, 120].map((minutes) => (
                  <button
                    type="button"
                    key={minutes}
                    aria-pressed={
                      Date.parse(item.end + "Z") -
                        Date.parse(item.start + "Z") ===
                      minutes * 60000
                    }
                    onClick={() => setDuration(i, minutes)}
                  >
                    {minutes === 60
                      ? "1 hr"
                      : minutes === 90
                        ? "1.5 hrs"
                        : "2 hrs"}
                  </button>
                ))}
              </div>
              <div className="booking-date-row">
                <Input
                  label="End date"
                  type="date"
                  min={item.start.slice(0, 10)}
                  value={item.end.slice(0, 10)}
                  set={(v) => itemSet(i, "end", `${v}T${item.end.slice(11)}`)}
                  required
                />
                <Input
                  label="End time"
                  type="time"
                  value={item.end.slice(11)}
                  set={(v) =>
                    itemSet(i, "end", `${item.end.slice(0, 10)}T${v}`)
                  }
                  required
                />
              </div>
              {Date.parse(item.end) <= Date.parse(item.start) && (
                <p className="error" role="alert">
                  End time must be after start time.
                </p>
              )}
            </div>
          ))}
          {["booking", "block"].includes(kind) && (
            <button
              type="button"
              className="add-range-button"
              onClick={() =>
                setItems([...items, { ...items[items.length - 1] }])
              }
            >
              ＋ Add another play area or time
            </button>
          )}
        </section>
        {kind !== "block" && (
          <section className="booking-section">
            <div className="form-section-heading">
              <span>3</span>
              <div>
                <h3>Customer details</h3>
                <p>
                  Link a registered player by phone, or save a walk-in’s
                  details.
                </p>
              </div>
            </div>
            <Input
              label="Customer phone"
              type="tel"
              placeholder="e.g. 077 123 4567"
              value={phone}
              set={setPhone}
            />
            <Input
              label="Customer name"
              placeholder="Customer’s name (optional)"
              value={name}
              set={setName}
            />
            <div aria-live="polite">
              {lookup.isFetching ? (
                <p className="form-hint">Looking up player…</p>
              ) : lookup.data?.found ? (
                <p className="lookup-match">
                  ✓ {lookup.data.player.name} · Registered player. This booking
                  will be linked to their account.
                </p>
              ) : lookup.data ? (
                <p className="form-hint">
                  No registered player found. Contact details will be saved with
                  this booking.
                </p>
              ) : null}
            </div>
            {lookup.isError && (
              <p className="error" role="alert">
                Player lookup unavailable. Check the number or try again.
              </p>
            )}
          </section>
        )}
        <section className="booking-section">
          <div className="form-section-heading">
            <span>{kind === "block" ? "3" : "4"}</span>
            <div>
              <h3>Review & save</h3>
              <p>Check your time ranges before confirming.</p>
            </div>
          </div>
          <Field label="Note (optional)">
            <textarea
              rows={3}
              placeholder={
                kind === "block"
                  ? "e.g. Court maintenance"
                  : "Anything the team should know?"
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="booking-review">
            <div>
              <span>
                {kinds.find((k) => k.id === kind)?.title}
                {kind === "weekly"
                  ? " booking"
                  : kind === "booking"
                    ? " booking"
                    : ""}
              </span>
              <strong>
                {items.length}{" "}
                {items.length === 1 ? "time range" : "time ranges"} ·{" "}
                {Number((totalMinutes / 60).toFixed(2))} hrs
                {kind === "weekly" ? " / week" : ""}
              </strong>
            </div>
            <ul>
              {items.map((item, i) => (
                <li key={i}>
                  <strong>
                    {areas.data?.find((a) => a.id === item.play_area_id)?.name}
                  </strong>
                  <span>
                    {/^\d{4}-\d{2}-\d{2}$/.test(item.start.slice(0, 10))
                      ? displayDate(item.start.slice(0, 10))
                      : "Choose a date"}{" "}
                    · {item.start.slice(11)} →{" "}
                    {item.start.slice(0, 10) === item.end.slice(0, 10)
                      ? item.end.slice(11)
                      : /^\d{4}-\d{2}-\d{2}$/.test(item.end.slice(0, 10))
                        ? `${displayDate(item.end.slice(0, 10))} · ${item.end.slice(11)}`
                        : "Choose an end date"}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Availability is checked when you save. Any conflicts will be shown
              here.
            </p>
          </div>
        </section>
      </Form>
      <Link className="booking-cancel" to={`/calendar?date=${date}`}>
        Cancel and return to calendar
      </Link>
    </div>
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
  const cancelled = b.status === "cancelled" || b.game_status === "cancelled";
  const bookingStatus = cancelled
    ? "cancelled"
    : b.admin_outcome || b.game_status || b.status;
  const active = !cancelled && b.status !== "expired";
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
    <div className="booking-detail">
      {action.feedback}
      <article className="booking-detail-summary">
        <div className="booking-detail-status">
          <span
            className={`booking-status-badge ${cancelled || bookingStatus === "no_show" ? "is-cancelled" : ""}`}
          >
            {statusLabel(bookingStatus)}
          </span>
          <span>
            {b.is_recurring
              ? "Weekly booking"
              : b.reservation_purpose === "block" && !b.locked_by_game
                ? "Blocked time"
                : "One-time booking"}
          </span>
        </div>
        <h3>{b.play_area_name || "Play area"}</h3>
        <p className="booking-detail-venue">{b.court_name}</p>
        <div className="booking-detail-time">
          <span aria-hidden="true">◷</span>
          <div>
            <strong>
              {displayTime(b.starts_at, zone)} – {displayTime(b.ends_at, zone)}
              {colomboDateKey(new Date(b.starts_at), zone) !==
              colomboDateKey(new Date(b.ends_at), zone)
                ? " (+1 day)"
                : ""}
            </strong>
            <p>
              {new Date(b.starts_at).toLocaleDateString("en", {
                timeZone: zone,
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <small>{zone.replaceAll("_", " ")}</small>
          </div>
        </div>
        {(b.reservation_purpose === "booking" || b.locked_by_game) && (
          <div className="booking-detail-price">
            <span>Booking value</span>
            <strong>LKR {Number(b.price || 0).toLocaleString()}</strong>
          </div>
        )}
      </article>
      {(b.reservation_purpose === "booking" ||
        b.locked_by_game ||
        b.admin_contact_name ||
        b.admin_contact_phone) && (
        <section className="booking-detail-customer">
          <h4>Customer</h4>
          <Contact
            phone={b.admin_contact_phone || b.booking_creator?.phone}
            name={
              b.admin_contact_name ||
              b.booking_creator?.name ||
              "No customer details saved"
            }
          />
          {b.admin_assigned_player && (
            <p>Linked player · {b.admin_assigned_player.name}</p>
          )}
        </section>
      )}
      {b.reservation_note && (
        <section className="booking-detail-note">
          <h4>Booking note</h4>
          <p>{b.reservation_note}</p>
        </section>
      )}
      {b.locked_by_game && (
        <Link
          className="booking-detail-game-link"
          to={`/games/${b.locked_by_game}`}
        >
          View game & players <span aria-hidden="true">→</span>
        </Link>
      )}
      {derived && (
        <p className="form-hint">
          Blocked by {b.blocking_source_play_area_name}
        </p>
      )}
      {((release && b.reservation_purpose === "booking") ||
        (weekly && b.recurring_booking_kind === "admin_reservation")) && (
        <details className="booking-detail-editor">
          <summary>Edit customer details</summary>
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
        </details>
      )}
      {release && (
        <details className="booking-detail-editor booking-detail-release">
          <summary>Release booking time</summary>
          <p>
            Release all or part of this time. The remaining time stays reserved.
          </p>
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
        </details>
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
      <div
        className="actions booking-detail-actions"
        aria-label="Manage booking"
      >
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
    </div>
  );
}
