import { useEffect, useState } from "react";
import type { RoomOccupancyResponse } from "@cc/shared";
import { api } from "../api.js";

/** Recent scan activity for a conference's rooms; `null` disables the poll (no event chosen). */
export function useRoomActivity(conference: string | null) {
  const [activity, setActivity] = useState<RoomOccupancyResponse | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!conference) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const result = await api.roomOccupancy(conference);
        if (active) setActivity(Array.isArray(result.rooms) ? result : null);
      } catch { if (active) setActivity(null); }
      finally { loading = false; }
    };
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [conference, generation]);
  return { activity, refresh: () => setGeneration((value) => value + 1) };
}

export function RoomActivityBadge({ room, activity }: { room: string; activity: RoomOccupancyResponse | null }) {
  const found = activity?.rooms.find((item) => item.room === room);
  return <span role="note" aria-label={`${room}: ${found ? found.level : "scan activity unavailable"}`}>
    {found ? `Scan activity: ${found.level}` : "Scan activity unavailable"}
  </span>;
}
