"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { coordinatesValid, type TrackingPoint } from "@/lib/selsyn";

/** Tiles OSM: somente viewport; sem geocoding, download offline ou dados pessoais enviados nos tiles. */
export function TrackingMap({ points, route = false }: { points: TrackingPoint[]; route?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    let map: LeafletMap | undefined;
    const el = host.current;
    if (!el) return;
    const valid = points.filter(p => coordinatesValid(p.latitude, p.longitude));
    if (!valid.length) return;
    const observer = new ResizeObserver(() => map?.invalidateSize());
    observer.observe(el);
    import("leaflet").then(L => {
      if (!alive) return;
      map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
      const ordered = route ? [...valid].filter(p => p.time && Number.isFinite(Date.parse(p.time))).sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!)) : valid;
      for (const p of valid) {
        const popup = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = p.label; popup.appendChild(title);
        for (const value of [p.time ? new Date(p.time).toLocaleString("pt-BR") : null, p.speed !== undefined ? `Velocidade: ${p.speed} km/h` : null, p.ignition !== undefined ? `Ignição: ${p.ignition ? "Ligada" : "Desligada"}` : null]) {
          if (value) { const row = document.createElement("div"); row.textContent = value; popup.appendChild(row); }
        }
        L.circleMarker([p.latitude, p.longitude], { radius: 7, color: "#600060", fillColor: "#a000a0", fillOpacity: 0.8 }).bindPopup(popup).addTo(map);
      }
      if (route && ordered.length > 1) L.polyline(ordered.map(p => [p.latitude, p.longitude]), { color: "#8b008b", weight: 3 }).addTo(map);
      if (valid.length === 1) map.setView([valid[0].latitude, valid[0].longitude], 14);
      else map.fitBounds(L.latLngBounds(valid.map(p => [p.latitude, p.longitude])), { padding: [24, 24], maxZoom: 16 });
    }).catch(() => alive && setError(true));
    return () => { alive = false; observer.disconnect(); map?.remove(); };
  }, [points, route]);
  if (!points.some(p => coordinatesValid(p.latitude, p.longitude))) return <p className="rounded-xl border border-line p-6 text-center text-sm text-muted">Sem coordenadas disponíveis para o mapa.</p>;
  return <div className="relative isolate overflow-hidden rounded-xl border border-line">
    {error && <p role="alert" className="bg-surface p-4 text-sm text-muted">Não foi possível carregar o mapa.</p>}
    <div ref={host} className="h-[clamp(280px,48vh,540px)] w-full" aria-label={route ? "Trajeto retornado pela Selsyn" : "Posições da frota"} />
  </div>;
}
