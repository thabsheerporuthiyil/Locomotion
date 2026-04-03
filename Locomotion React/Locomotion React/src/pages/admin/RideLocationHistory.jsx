import { createElement, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Clock3,
  MapPinned,
  Pause,
  Play,
  RefreshCw,
  Route,
  Search,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../api/axios";

function normalizeError(error, fallback) {
  const data = error?.response?.data;
  if (typeof data === "string") return data;
  if (data?.error) return data.error;
  if (data?.detail) return data.detail;
  return fallback;
}

function formatTimestamp(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function FitMapToPoints({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    if (points.length === 1) {
      map.setView(points[0], 16, { animate: true });
      return;
    }

    map.fitBounds(points, {
      padding: [36, 36],
      animate: true,
    });
  }, [map, points]);

  return null;
}

function StatCard({ icon, label, value, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
          {label}
        </div>
        <div className="mt-2 text-2xl font-black text-slate-900">
          {value}
        </div>
      </div>
      <div
        className={`w-12 h-12 rounded-2xl ring-1 flex items-center justify-center ${tones[tone]}`}
      >
        {icon ? createElement(icon, { size: 20 }) : null}
      </div>
    </div>
  );
}

export default function RideLocationHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRideId = searchParams.get("rideId") || "";

  const [rideIdInput, setRideIdInput] = useState(initialRideId);
  const [recentRides, setRecentRides] = useState([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const fetchRecentRides = async () => {
    setRidesLoading(true);
    try {
      const res = await api.get("location/admin/rides/", {
        params: { limit: 30 },
      });
      setRecentRides(res.data?.results || []);
    } catch (err) {
      console.error(err);
      setRecentRides([]);
    } finally {
      setRidesLoading(false);
    }
  };

  const fetchHistory = async (rideId) => {
    const normalizedRideId = String(rideId || "").trim();
    if (!normalizedRideId) {
      setHistory(null);
      setError("Enter a ride ID to load location history.");
      setIsPlaying(false);
      return;
    }

    setLoading(true);
    setError("");
    setIsPlaying(false);

    try {
      const res = await api.get(`location/admin/rides/${normalizedRideId}/history/`, {
        params: { order: "asc", limit: 1000 },
      });
      setHistory(res.data);
      setSelectedIndex(0);
      setSearchParams({ rideId: normalizedRideId });
    } catch (err) {
      console.error(err);
      setHistory(null);
      setError(normalizeError(err, "Failed to load ride location history."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentRides();
    if (initialRideId) {
      fetchHistory(initialRideId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const points = useMemo(() => {
    const rawResults = history?.results || [];
    return rawResults
      .map((item, index) => {
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          ...item,
          index,
          latitude,
          longitude,
          position: [latitude, longitude],
        };
      })
      .filter(Boolean);
  }, [history]);

  const safeIndex = points.length
    ? Math.min(selectedIndex, points.length - 1)
    : 0;
  const currentPoint = points[safeIndex] || null;
  const playedPoints = points.slice(0, safeIndex + 1);

  const driverTrail = useMemo(
    () => playedPoints.filter((item) => item.role === "driver").map((item) => item.position),
    [playedPoints],
  );
  const riderTrail = useMemo(
    () => playedPoints.filter((item) => item.role === "rider").map((item) => item.position),
    [playedPoints],
  );
  const allPositions = useMemo(() => points.map((item) => item.position), [points]);

  const driverCount = useMemo(
    () => points.filter((item) => item.role === "driver").length,
    [points],
  );
  const riderCount = useMemo(
    () => points.filter((item) => item.role === "rider").length,
    [points],
  );

  useEffect(() => {
    if (!isPlaying || points.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setSelectedIndex((prev) => {
        if (prev >= points.length - 1) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [isPlaying, points.length]);

  useEffect(() => {
    if (!points.length) {
      setSelectedIndex(0);
      setIsPlaying(false);
      return;
    }

    if (selectedIndex > points.length - 1) {
      setSelectedIndex(points.length - 1);
    }
  }, [points.length, selectedIndex]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await fetchHistory(rideIdInput);
  };

  const handleRefresh = async () => {
    await fetchHistory(rideIdInput || initialRideId);
  };

  const playbackLabel = currentPoint
    ? `${currentPoint.role === "driver" ? "Driver" : "Rider"} point ${safeIndex + 1} of ${points.length}`
    : "No point selected";

  const noSavedPointsMessage =
    history && history.count === 0
      ? "This ride exists, but no live location points have been stored yet. History starts only after the driver or rider sends live location updates."
      : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-sm text-slate-500">
            Inspect historical ride movement saved to DynamoDB and scrub through it on a map.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={rideIdInput}
              onChange={(event) => setRideIdInput(event.target.value)}
              placeholder="Enter ride ID"
              className="pl-10 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-full sm:w-64"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition disabled:opacity-60"
            disabled={loading}
          >
            <Search size={18} />
            Load
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
            disabled={loading || !rideIdInput}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={MapPinned}
          label="Ride ID"
          value={history?.ride_id ?? "—"}
          tone="indigo"
        />
        <StatCard
          icon={Route}
          label="Saved Points"
          value={history?.count ?? 0}
          tone="emerald"
        />
        <StatCard
          icon={Clock3}
          label="Driver Points"
          value={driverCount}
          tone="amber"
        />
        <StatCard
          icon={Clock3}
          label="Rider Points"
          value={riderCount}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1.5fr_0.9fr] gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-slate-900">Playback Map</div>
              <div className="text-xs font-semibold text-slate-500">
                {history?.booking_status
                  ? `Booking status: ${history.booking_status}`
                  : "Load a ride ID to begin"}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {playbackLabel}
            </div>
          </div>

          <div className="h-[480px] bg-slate-100">
            {!points.length ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-3xl bg-indigo-50 text-indigo-700 flex items-center justify-center ring-1 ring-indigo-100 mb-4">
                  <MapPinned size={24} />
                </div>
                <div className="font-black text-slate-900">
                  {history ? "No stored points yet" : "No ride history loaded"}
                </div>
                <div className="mt-2 text-sm text-slate-500 max-w-md">
                  {noSavedPointsMessage ||
                    "Enter a ride ID above to view the stored location trail and step through each recorded point."}
                </div>
              </div>
            ) : (
              <MapContainer center={allPositions[0]} zoom={14} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <FitMapToPoints points={allPositions} />

                {driverTrail.length > 1 && (
                  <Polyline positions={driverTrail} pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.85 }} />
                )}
                {riderTrail.length > 1 && (
                  <Polyline positions={riderTrail} pathOptions={{ color: "#059669", weight: 5, opacity: 0.75, dashArray: "8 10" }} />
                )}

                {points.map((item) => {
                  const isCurrent = currentPoint?.index === item.index;
                  const isDriver = item.role === "driver";
                  const color = isDriver ? "#2563eb" : "#059669";
                  return (
                    <CircleMarker
                      key={`${item.event_ts}-${item.index}`}
                      center={item.position}
                      radius={isCurrent ? 10 : 5}
                      pathOptions={{
                        color,
                        weight: isCurrent ? 3 : 1,
                        fillColor: color,
                        fillOpacity: isCurrent ? 0.95 : 0.55,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -8]}>
                        {isDriver ? "Driver" : "Rider"} • {formatTimestamp(item.event_ts)}
                      </Tooltip>
                      <Popup>
                        <div className="space-y-1 text-sm">
                          <div className="font-bold">{isDriver ? "Driver" : "Rider"} point</div>
                          <div>{formatTimestamp(item.event_ts)}</div>
                          <div>
                            {item.latitude}, {item.longitude}
                          </div>
                          <div>Source: {item.source || "unknown"}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setSelectedIndex(0);
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
                  disabled={!points.length}
                >
                  <SkipBack size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying((value) => !value)}
                  className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                  disabled={points.length <= 1}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setSelectedIndex(points.length ? points.length - 1 : 0);
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
                  disabled={!points.length}
                >
                  <SkipForward size={18} />
                </button>
              </div>

              <input
                type="range"
                min="0"
                max={Math.max(points.length - 1, 0)}
                value={safeIndex}
                onChange={(event) => {
                  setIsPlaying(false);
                  setSelectedIndex(Number(event.target.value));
                }}
                className="w-full accent-indigo-600"
                disabled={!points.length}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
                  Current Point
                </div>
                {currentPoint ? (
                  <div className="mt-2 space-y-1 text-slate-700">
                    <div className="font-bold text-slate-900">
                      {currentPoint.role === "driver" ? "Driver" : "Rider"}
                    </div>
                    <div>{formatTimestamp(currentPoint.event_ts)}</div>
                    <div>
                      {currentPoint.latitude}, {currentPoint.longitude}
                    </div>
                    <div>Source: {currentPoint.source || "unknown"}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-slate-500">No point selected.</div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
                  History Window
                </div>
                <div className="mt-2 space-y-1 text-slate-700">
                  <div>
                    Start: {points[0] ? formatTimestamp(points[0].event_ts) : "—"}
                  </div>
                  <div>
                    End: {points.length ? formatTimestamp(points[points.length - 1].event_ts) : "—"}
                  </div>
                  <div>Returned points: {points.length}</div>
                  <div>Next cursor: {history?.next_cursor || "None"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="font-black text-slate-900">Recorded Events</div>
            <div className="text-xs font-semibold text-slate-500">
              Click a row to jump the playback cursor to that saved point.
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto divide-y divide-slate-100">
            {!points.length ? (
              <div className="p-6 text-slate-500">No history loaded yet.</div>
            ) : (
              points.map((item) => {
                const active = item.index === safeIndex;
                const isDriver = item.role === "driver";
                return (
                  <button
                    key={`${item.event_ts}-${item.index}-row`}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setSelectedIndex(item.index);
                    }}
                    className={[
                      "w-full text-left p-4 transition",
                      active ? "bg-indigo-50" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              "px-2.5 py-1 rounded-full text-[11px] font-black ring-1",
                              isDriver
                                ? "bg-indigo-100 text-indigo-700 ring-indigo-200"
                                : "bg-emerald-100 text-emerald-700 ring-emerald-200",
                            ].join(" ")}
                          >
                            {isDriver ? "Driver" : "Rider"}
                          </span>
                          <span className="text-xs font-bold text-slate-400">
                            #{item.index + 1}
                          </span>
                        </div>
                        <div className="mt-2 font-semibold text-slate-900">
                          {formatTimestamp(item.event_ts)}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 break-all">
                          {item.latitude}, {item.longitude}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {item.source || "unknown source"}
                        </div>
                      </div>
                      {active && (
                        <div className="text-xs font-black text-indigo-700">
                          Playing
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <div className="font-black text-slate-900">Recent Rides</div>
            <div className="text-xs font-semibold text-slate-500">
              Pick a ride directly here if you do not know the ride ID yet.
            </div>
          </div>
          <button
            type="button"
            onClick={fetchRecentRides}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-60"
            disabled={ridesLoading}
          >
            <RefreshCw size={16} className={ridesLoading ? "animate-spin" : ""} />
            Refresh list
          </button>
        </div>

        {ridesLoading ? (
          <div className="p-6 text-slate-500">Loading recent rides…</div>
        ) : recentRides.length === 0 ? (
          <div className="p-6 text-slate-500">
            No recent rides were returned for the admin picker.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left bg-slate-50">
                <tr className="text-slate-600">
                  <th className="py-3 px-4">Ride ID</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Rider</th>
                  <th className="px-4">Driver</th>
                  <th className="px-4">Route</th>
                  <th className="px-4">Created</th>
                  <th className="px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRides.map((ride) => (
                  <tr key={ride.id} className="border-b hover:bg-slate-50 align-top">
                    <td className="py-4 px-4">
                      <div className="font-black text-slate-900">#{ride.id}</div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                        {ride.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{ride.rider_name || "Unknown rider"}</div>
                      <div className="text-xs text-slate-500">{ride.rider_email || ""}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{ride.driver_name || "Unknown driver"}</div>
                      <div className="text-xs text-slate-500">{ride.driver_email || ""}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900">{ride.source_location}</div>
                      <div className="text-xs text-slate-500">to {ride.destination_location}</div>
                    </td>
                    <td className="py-4 px-4 text-slate-600">
                      {formatTimestamp(ride.created_at)}
                    </td>
                    <td className="py-4 px-4">
                      <button
                        type="button"
                        onClick={() => {
                          setRideIdInput(String(ride.id));
                          fetchHistory(ride.id);
                        }}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
                      >
                        Load history
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
