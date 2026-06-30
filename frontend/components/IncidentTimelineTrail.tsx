/**
 * IncidentTimelineTrail.tsx
 *
 * Task 4 — Visual incident investigation trail.
 * Renders deny/allow events around the incident window with INCIDENT CREATED marker.
 *
 * Usage inside incidents.tsx drawer:
 *   import { IncidentTimelineTrail } from "../components/IncidentTimelineTrail";
 *   <IncidentTimelineTrail incidentId={incident.id} incidentCreatedAt={incident.created_at} />
 */

import React, { useState, useEffect } from "react";
import { incidentApi } from "../lib/apiClient";
import { RuntimeEvent } from "../lib/types";
import { FiAlertTriangle, FiCheckCircle, FiXCircle, FiFlag } from "react-icons/fi";

interface Props {
  incidentId: string;
  incidentCreatedAt: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export const IncidentTimelineTrail: React.FC<Props> = ({ incidentId, incidentCreatedAt }) => {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    incidentApi.getEvents(incidentId)
      .then((r) => setEvents(r.data))
      .finally(() => setLoading(false));
  }, [incidentId]);

  if (loading) return <p className="text-xs text-gray-400 animate-pulse py-4">Loading trail…</p>;
  if (events.length === 0) return (
    <p className="text-xs text-gray-400 py-4">No runtime events found in the incident window.</p>
  );

  const incidentTs = new Date(incidentCreatedAt).getTime();

  // Sort ascending by time
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Find where to insert the INCIDENT CREATED marker
  let markerInserted = false;

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-2 pl-10">
        {sorted.map((ev, i) => {
          const evTs = new Date(ev.created_at).getTime();
          const showMarker = !markerInserted && evTs >= incidentTs;
          if (showMarker) markerInserted = true;

          return (
            <React.Fragment key={ev.id}>
              {showMarker && (
                <div className="relative flex items-center">
                  {/* Marker dot */}
                  <div className="absolute -left-[34px] w-6 h-6 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-white">
                    <FiFlag className="w-3 h-3 text-white" />
                  </div>
                  <div className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                      ⚡ Incident Created — {fmt(incidentCreatedAt)}
                    </p>
                  </div>
                </div>
              )}

              <div className="relative flex items-start space-x-3">
                {/* Event dot */}
                <div className={`absolute -left-[34px] w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white ${
                  ev.status === "deny" ? "bg-red-100" : "bg-green-100"
                }`}>
                  {ev.status === "deny"
                    ? <FiXCircle className="w-3 h-3 text-red-600" />
                    : <FiCheckCircle className="w-3 h-3 text-green-600" />}
                </div>

                <div className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                  ev.status === "deny"
                    ? "bg-red-50 border-red-100"
                    : "bg-green-50 border-green-100"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`font-bold uppercase ${
                        ev.status === "deny" ? "text-red-700" : "text-green-700"
                      }`}>
                        {ev.status}
                      </span>
                      <span className="text-gray-600 capitalize">{ev.action}</span>
                    </div>
                    <span className="text-gray-400 font-mono">{fmt(ev.created_at)}</span>
                  </div>
                  {ev.prompt_preview && (
                    <p className="text-gray-500 italic mt-0.5 truncate">
                      "{ev.prompt_preview}"
                    </p>
                  )}
                  {ev.session_id && (
                    <p className="text-gray-400 mt-0.5">Session: {ev.session_id}</p>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Marker at end if all events are before the incident */}
        {!markerInserted && (
          <div className="relative flex items-center">
            <div className="absolute -left-[34px] w-6 h-6 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-white">
              <FiFlag className="w-3 h-3 text-white" />
            </div>
            <div className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                ⚡ Incident Created — {fmt(incidentCreatedAt)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncidentTimelineTrail;
