import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import type { Location } from "../types/domain";

type Geometry = { coordinates?: number[][] };
export function RoadPreviewMap({
  origin,
  destination,
  geometry,
  onSelect,
  en = false,
}: {
  origin?: Location;
  destination?: Location;
  geometry?: Geometry;
  onSelect?: (point: Location) => void;
  en?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const [failed, setFailed] = useState(false);
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    let active = true;
    if (key && container.current)
      void new Loader({ apiKey: key, version: "weekly" })
        .load()
        .then(() => {
          if (active && container.current)
            setMap(
              new google.maps.Map(container.current, {
                center: { lat: 34.4884, lng: 133.3614 },
                zoom: 15,
                zoomControl: true,
                disableDefaultUI: true,
                clickableIcons: false,
              }),
            );
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (!map || !onSelect) return;
    const listener = map.addListener(
      "click",
      (event: google.maps.MapMouseEvent) => {
        if (event.latLng)
          onSelect({
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          });
      },
    );
    return () => listener.remove();
  }, [map, onSelect]);
  useEffect(() => {
    if (!map) return;
    const overlays: (google.maps.Marker | google.maps.Polyline)[] = [];
    const point = (p: Location) => ({ lat: p.latitude, lng: p.longitude });
    for (const [value, label] of [
      [origin, "A"],
      [destination, "B"],
    ] as const) {
      if (value)
        overlays.push(
          new google.maps.Marker({
            map,
            position: point(value),
            label,
            title:
              label === "A"
                ? en
                  ? "Start"
                  : "出発地"
                : en
                  ? "Destination"
                  : "目的地",
          }),
        );
    }
    if (geometry?.coordinates?.length) {
      const path = geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      overlays.push(
        new google.maps.Polyline({
          map,
          path,
          strokeColor: "#4f46e5",
          strokeWeight: 6,
        }),
      );
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 45);
    } else if (origin) map.panTo(point(origin));
    return () => overlays.forEach((item) => item.setMap(null));
  }, [map, origin, destination, geometry, en]);
  return (
    <>
      {(!key || failed) && (
        <p role="alert">
          {en
            ? "Google Maps unavailable. Enter coordinates below; no fictional road map is substituted."
            : "Google Mapsを表示できません。下の座標指定を使用してください。架空道路への置換は行いません。"}
        </p>
      )}
      <div
        ref={container}
        className="road-preview-map"
        aria-label={en ? "Road preview map" : "道路案内の地図"}
      />
      <p className="muted">
        {en
          ? "A: start · B: destination. Selected places are not verified evacuation sites."
          : "A：出発地・B：目的地。選んだ地点は避難先として確認されていません。"}
      </p>
    </>
  );
}
