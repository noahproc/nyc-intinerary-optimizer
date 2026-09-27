"use client";

import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { MODE_META } from "@/lib/modes";
import { END_ID, START_ID, type LatLng, type Trip } from "@/lib/types";

const toLL = (p: LatLng): [number, number] => [p.lat, p.lng];

function numberIcon(label: string, endpoint: boolean) {
  return L.divIcon({ className: `num-marker${endpoint ? " endpoint" : ""}`, html: label, iconSize: [24, 24] });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (!points.length) return;
    // The container may have just been sized (dynamic import / layout), so re-measure first.
    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function TripMap({ trip, highlightLeg }: { trip: Trip | null; highlightLeg: number | null }) {
  const stops = trip?.schedule ?? [];
  const points = stops.map((s) => toLL(s.stop.place.location));
  const sameEnds = trip && trip.request.start.id === trip.request.end.id;
  let n = 0;

  return (
    <MapContainer center={[40.7359, -73.9911]} zoom={12} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={points} />
      {trip?.legs.map((leg, i) =>
        leg.segments.map((s, j) => {
          const meta = MODE_META[s.mode];
          const path = s.path?.length ? s.path.map(toLL) : [toLL(s.from), toLL(s.to)];
          const faded = highlightLeg !== null && highlightLeg !== i;
          return (
            <Polyline
              key={`${i}-${j}`}
              positions={path}
              pathOptions={{
                color: meta.color,
                weight: highlightLeg === i ? 7 : 5,
                opacity: faded ? 0.25 : 0.9,
                dashArray: meta.dashed ? "4 8" : undefined,
              }}
            >
              <Tooltip sticky>{s.label ?? meta.label} · {s.durationMin} min</Tooltip>
            </Polyline>
          );
        }),
      )}
      {trip?.legs.flatMap((leg) =>
        leg.suggestions.map((sg) => (
          <CircleMarker
            key={`sg-${sg.place.id}`}
            center={toLL(sg.place.location)}
            radius={6}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#f0b54a", fillOpacity: 1 }}
          >
            <Tooltip>✨ {sg.place.name} ({sg.reason})</Tooltip>
          </CircleMarker>
        )),
      )}
      {stops.map((s) => {
        const endpoint = s.stop.id === START_ID || s.stop.id === END_ID;
        if (s.stop.id === END_ID && sameEnds) return null;
        const label = endpoint ? (s.stop.id === START_ID ? (sameEnds ? "⌂" : "A") : "B") : String(++n);
        return (
          <Marker key={s.stop.id} position={toLL(s.stop.place.location)} icon={numberIcon(label, endpoint)}>
            <Tooltip>{s.stop.place.name}</Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
