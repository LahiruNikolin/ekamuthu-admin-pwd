import { useState, type ReactNode } from "react";

// Fixed-size rows bound DOM/render work even when a weekly calendar has thousands of entries.
// Six visible rows plus four overscan rows on either side. No scroll library or animation loop.
export default function VirtualList<T>({
  items,
  render,
  itemKey,
}: {
  items: T[];
  render: (item: T) => ReactNode;
  itemKey: (item: T) => string;
}) {
  const [first, setFirst] = useState(0);
  const rowHeight = 88;
  const visible = 6;
  const start = Math.max(
    0,
    Math.min(first, Math.max(0, items.length - visible)) - 4,
  );
  const end = Math.min(items.length, start + visible + 8);
  return (
    <div
      className="virtual-calendar"
      role="region"
      aria-label="Calendar bookings"
      tabIndex={0}
      onScroll={(event) =>
        setFirst(Math.floor(event.currentTarget.scrollTop / rowHeight))
      }
    >
      <div
        role="list"
        aria-label={`${items.length} calendar entries`}
        style={{ height: items.length * rowHeight, position: "relative" }}
      >
        {items.slice(start, end).map((item, index) => (
          <div
            key={itemKey(item)}
            role="listitem"
            aria-posinset={start + index + 1}
            aria-setsize={items.length}
            style={{
              position: "absolute",
              top: (start + index) * rowHeight,
              height: rowHeight,
              width: "100%",
              paddingBottom: 8,
            }}
          >
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
