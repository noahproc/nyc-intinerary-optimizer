"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { MODE_META } from "@/lib/modes";
import { END_ID, START_ID, type LatLng, type Trip } from "@/lib/types";

const toLL = (p: LatLng): [number, number] => [p.lat, p.lng];

const HOME_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>';

function pinIcon(label: string, home: boolean, selected: boolean) {
  return L.divIcon({
    className: `pin${home ? " home" : ""}${selected ? " sel" : ""}`,
    html: home ? HOME_SVG : label,
    iconSize: [30, 30],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      // Leave room for the itinerary panel on wide screens.
      const wide = map.getContainer().clientWidth > 900;
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [wide ? 480 : 30, wide ? 90 : 70],
        paddingBottomRight: [30, 40],
        maxZoom: 15,
      });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [target, map]);
  return null;
}

interface Props {
  trip: Trip | null;
  highlightLeg: number | null;
  selectedStop: string | null;
  onSelectStop: (id: string) => void;
}

export default function TripMap({ trip, highlightLeg, selectedStop, onSelectStop }: Props) {
  const stops = trip?.schedule ?? [];
  const points = stops.map((s) => toLL(s.stop.place.location));
  const sameEnds = trip && trip.request.start.id === trip.request.end.id;
  const selected = stops.find((s) => s.stop.id === selectedStop);
  const flyTarget = useMemo(() => (selected ? toLL(selected.stop.place.location) : null), [selected]);
  let n = 0;

  return (
    <MapContainer center={[40.7359, -73.9911]} zoom={12} zoomControl={false} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomBottomRight />
      <FitBounds points={points} />
      <FlyTo target={flyTarget} />
      {trip?.legs.map((leg, i) =>
        leg.segments.map((s, j) => {
          const meta = MODE_META[s.mode];
          const path = s.path?.length ? s.path.map(toLL) : [toLL(s.from), toLL(s.to)];
          const active = highlightLeg === i;
          const faded = highlightLeg !== null && !active;
          return (
            <FragmentLine
              key={`${i}-${j}-${active}`}
              path={path}
              color={meta.color}
              dashed={!!meta.dashed}
              active={active}
              faded={faded}
              label={`${s.label ?? meta.label} · ${s.durationMin} min`}
            />
          );
        }),
      )}
      {trip?.legs.flatMap((leg) =>
        leg.suggestions.map((sg) => (
          <CircleMarker
            key={`sg-${sg.place.id}`}
            center={toLL(sg.place.location)}
            radius={6}
            pathOptions={{ color: "#000", weight: 2, fillColor: "#ffb547", fillOpacity: 1 }}
          >
            <Tooltip>Along the way: {sg.place.name}</Tooltip>
          </CircleMarker>
        )),
      )}
      {stops.map((s) => {
        const endpoint = s.stop.id === START_ID || s.stop.id === END_ID;
        if (s.stop.id === END_ID && sameEnds) return null;
        const label = endpoint ? "" : String(++n);
        return (
          <Marker
            key={`${s.stop.id}-${selectedStop === s.stop.id}`}
            position={toLL(s.stop.place.location)}
            icon={pinIcon(label, endpoint, selectedStop === s.stop.id)}
            eventHandlers={{ click: () => onSelectStop(s.stop.id) }}
            zIndexOffset={selectedStop === s.stop.id ? 1000 : 0}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {s.stop.place.name}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

function ZoomBottomRight() {
  const map = useMap();
  useEffect(() => {
    const zoom = L.control.zoom({ position: "bottomright" });
    zoom.addTo(map);
    return () => {
      zoom.remove();
    };
  }, [map]);
  return null;
}

/** A route line with a soft glow underneath; the active leg animates. */
function FragmentLine(props: { path: [number, number][]; color: string; dashed: boolean; active: boolean; faded: boolean; label: string }) {
  const { path, color, dashed, active, faded, label } = props;
  return (
    <>
      {!dashed && (
        <Polyline positions={path} interactive={false} pathOptions={{ color, weight: active ? 16 : 11, opacity: faded ? 0.04 : 0.18 }} />
      )}
      <Polyline
        positions={path}
        pathOptions={{
          color,
          weight: active ? 6 : dashed ? 3 : 4.5,
          opacity: faded ? 0.25 : 0.95,
          dashArray: dashed ? "2 8" : undefined,
          className: active && !dashed ? "flow" : undefined,
        }}
      >
        <Tooltip sticky>{label}</Tooltip>
      </Polyline>
    </>
  );
}
