/**
 * Map view (PF-210) — plots geotagged photos on an OpenStreetMap base
 * layer using Leaflet directly (no react-leaflet, to avoid peer-dep
 * friction with React 19). Mounted with `client:only` so Leaflet never
 * touches `window` during SSR.
 *
 * Each photo is a small circular thumbnail marker; clicking opens a
 * popup with a larger thumbnail + name linking to the full image.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { photoUrl, thumbUrl } from "~/lib/photo";

export interface MapPoint {
  id: number;
  name: string;
  developed_at: number;
  lat: number;
  lng: number;
}

export default function MapView({ points }: { points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      // Sensible world view before we fit to the markers.
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers: L.Marker[] = [];
    for (const p of points) {
      const icon = L.divIcon({
        className: "map-pin",
        html: `<img src="${thumbUrl(p)}" alt="" loading="lazy" />`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });
      const marker = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(map);
      marker.bindPopup(
        `<a class="map-popup" href="${photoUrl(p)}" target="_blank" rel="noopener noreferrer">
           <img src="${thumbUrl(p)}" alt="" />
           <span>${escapeHtml(p.name)}</span>
         </a>`,
        { minWidth: 180, closeButton: true },
      );
      markers.push(marker);
    }

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 14 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  return <div ref={containerRef} className="map-canvas" />;
}

/** Minimal HTML escape for the popup name (Leaflet popups take raw HTML). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
