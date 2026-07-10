import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet + OpenStreetMap pin picker. Shows a draggable marker; tapping the map
// also moves it. Reports the chosen {lat,lng} up. `center` recentres the map
// (e.g. when the user searches a new address). No API key (OSM tiles).
//
// Fix Leaflet's default marker icon paths (they break under a bundler otherwise).
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// Limassol as a sensible Cyprus default when nothing is set yet.
const DEFAULT: [number, number] = [34.707, 33.022];

export default function MapPicker({
  value,
  center,
  onChange,
  height = 220,
  readOnly = false,
}: {
  value?: { lat: number; lng: number };
  center?: { lat: number; lng: number };   // recentre trigger (searched address)
  onChange?: (p: { lat: number; lng: number }) => void;
  height?: number;
  readOnly?: boolean;                        // display-only (agent view): no drag/tap
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emit = (p: { lat: number; lng: number }) => { if (!readOnly) onChangeRef.current?.(p); };

  // init once
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const start: [number, number] = value ? [value.lat, value.lng] : (center ? [center.lat, center.lng] : DEFAULT);
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(start, value || center ? 16 : 12);
    // Standard OpenStreetMap tiles — best building/house coverage (free, no key).
    // Satellite (Esri World Imagery, also free) offered as a layer toggle for the
    // Google-Maps-like aerial view.
    const streets = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "© OpenStreetMap" },
    ).addTo(map);
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, attribution: "© Esri" },
    );
    L.control.layers({ Map: streets, Satellite: satellite }, undefined, { position: "topright", collapsed: true }).addTo(map);
    const marker = L.marker(start, { draggable: !readOnly, icon }).addTo(map);
    if (!readOnly) {
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        emit({ lat: p.lat, lng: p.lng });
      });
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        emit({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }
    mapRef.current = map;
    markerRef.current = marker;
    // Leaflet needs a size recalc after mount inside a sheet/modal.
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // recentre when the searched address changes (only if the user hasn't a pin yet
  // or explicitly re-searched — we move both map + marker to the new center)
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !center) return;
    const c: [number, number] = [center.lat, center.lng];
    mapRef.current.setView(c, 16);
    markerRef.current.setLatLng(c);
    emit({ lat: center.lat, lng: center.lng });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={elRef} style={{ width: "100%", height, borderRadius: 12, overflow: "hidden" }} />;
}
