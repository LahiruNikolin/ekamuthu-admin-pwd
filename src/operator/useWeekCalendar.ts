import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/client";
import { calendarDisplayBlocks } from "./calendarVisibility";
import type {
  OperatorCourt,
  OperatorPlayArea,
  OperatorCalendarBlock,
} from "./types";

// Main and fullscreen calendars share the same cache and availability snapshot.
export default function useWeekCalendar(courts: OperatorCourt[], start: string) {
  const query = useQuery({
    queryKey: [
      "calendar-overview",
      courts.map((c) => c.id).join(","),
      start,
      "week",
    ],
    queryFn: ({ signal }) =>
      Promise.all(
        courts.map(async (court) => {
          try {
            const [areas, blocks] = await Promise.all([
              adminApi.get<OperatorPlayArea[]>(
                `/courts/${court.id}/play-areas`,
                signal,
              ),
              adminApi.get<OperatorCalendarBlock[]>(
                `/admin/calendar/days?court_id=${court.id}&start_date=${start}&days=7`,
                signal,
              ),
            ]);
            return {
              areas,
              blocks: calendarDisplayBlocks(blocks),
              court,
              failed: false,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              areas: [] as OperatorPlayArea[],
              blocks: [] as OperatorCalendarBlock[],
              court,
              failed: true,
            };
          }
        }),
      ),
    enabled: !!courts.length,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data || [];
  return {
    ...query,
    areas: data.flatMap((d) => d.areas.map((a) => ({ ...a, court: d.court }))),
    blocks: data
      .flatMap((d) =>
        d.blocks.map((b) => ({
          ...b,
          court_id: d.court.id,
          court_name: d.court.name,
        })),
      )
      .filter((b) => b.status !== "available"),
  };
}
