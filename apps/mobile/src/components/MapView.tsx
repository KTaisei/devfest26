import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { useAppStore } from "../stores/useAppStore";
import type {
  EvacuationRoute,
  Location,
  Scenario,
  Shelter,
} from "../types/domain";

interface Props {
  scenario?: Scenario;
  shelters: Shelter[];
  route?: EvacuationRoute;
  selected?: string;
  onSelect: (id: string) => void;
}
export function MapView({
  scenario,
  shelters,
  route,
  selected,
  onSelect,
}: Props) {
  const { location, language } = useAppStore();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map>();
  const [mapError, setMapError] = useState(false);
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    let live = true;
    if (key && container.current)
      new Loader({ apiKey: key, version: "weekly" })
        .load()
        .then(() => {
          if (live && container.current)
            setMap(
              new google.maps.Map(container.current, {
                center: { lat: 34.4905, lng: 133.3614 },
                zoom: 16,
                disableDefaultUI: true,
                zoomControl: true,
              }),
            );
        })
        .catch(() => {
          if (live) setMapError(true);
        });
    return () => {
      live = false;
    };
  }, [key]);
  useEffect(() => {
    if (!map || !scenario) return;
    const overlays: (google.maps.Marker | google.maps.Polyline)[] = [];
    const point = (loc: Location) => ({
      lat: loc.latitude,
      lng: loc.longitude,
    });
    overlays.push(
      new google.maps.Marker({
        map,
        position: point(location),
        title: "Current position",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      }),
    );
    shelters.forEach((s) => {
      const marker = new google.maps.Marker({
        map,
        position: point(s),
        title: s.name,
        label: "避",
      });
      marker.addListener("click", () => onSelect(s.id));
      overlays.push(marker);
    });
    scenario.edges
      .filter((e) => e.roadStatus !== "open")
      .forEach((edge) => {
        const a = scenario.nodes.find((n) => n.id === edge.fromNode)!,
          b = scenario.nodes.find((n) => n.id === edge.toNode)!;
        overlays.push(
          new google.maps.Polyline({
            map,
            path: [point(a), point(b)],
            strokeColor: edge.roadStatus === "closed" ? "#dc2626" : "#f59e0b",
            strokeWeight: 6,
          }),
        );
      });
    if (route)
      overlays.push(
        new google.maps.Polyline({
          map,
          path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
          strokeColor: "#2563eb",
          strokeWeight: 6,
        }),
      );
    return () => overlays.forEach((o) => o.setMap(null));
  }, [map, scenario, shelters, route, location, onSelect]);
  // This is deliberately a schematic, not an unlicensed geographic basemap.
  const project = (loc: Location) => ({
    x: 110 + (loc.longitude - 133.3598) * 90000,
    y: 430 - (loc.latitude - 34.4884) * 90000,
  });
  const origin = project(location);
  return (
    <div className="map-panel">
      <div
        ref={container}
        className="google-map"
        style={{ display: key && !mapError ? "block" : "none" }}
      />
      {(!key || mapError) && (
        <svg
          className="schematic-map"
          viewBox="0 0 550 510"
          role="img"
          aria-label={
            language === "ja"
              ? "架空の道路網を示す模式図"
              : "Schematic of fictional road network"
          }
        >
          <defs>
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M32 0H0V32"
                fill="none"
                stroke="#dce5e9"
                strokeWidth=".6"
              />
            </pattern>
          </defs>
          <rect width="550" height="510" fill="#eef3f4" />
          <rect width="550" height="510" fill="url(#grid)" />
          <path
            d="M0 80C180 120 100 260 270 300S430 380 550 330"
            stroke="#c6e4f1"
            strokeWidth="48"
            fill="none"
          />
          <rect
            x="40"
            y="135"
            width="120"
            height="125"
            rx="28"
            fill="#d6e8d8"
          />
          <rect
            x="340"
            y="120"
            width="125"
            height="100"
            rx="14"
            fill="#e0e7e5"
          />
          <text x="37" y="40" fill="#839496" fontSize="11" letterSpacing="3">
            FUKUYAMA / SIMULATED NETWORK
          </text>
          {scenario?.edges.map((e) => {
            const a = project(scenario.nodes.find((n) => n.id === e.fromNode)!),
              b = project(scenario.nodes.find((n) => n.id === e.toNode)!);
            return (
              <g key={e.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#d3dce0"
                  strokeWidth="19"
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={
                    e.roadStatus === "closed"
                      ? "#dc2626"
                      : e.roadStatus === "unknown" ||
                          e.roadStatus === "restricted"
                        ? "#f59e0b"
                        : "#fff"
                  }
                  strokeWidth="12"
                  strokeDasharray={e.hasStairs ? "5 4" : undefined}
                />
                <text
                  x={(a.x + b.x) / 2 + 12}
                  y={(a.y + b.y) / 2 - 10}
                  fontSize="10"
                  fill="#687d86"
                >
                  {e.id}
                  {e.hasStairs ? " 階段" : ""}
                  {e.roadStatus !== "open" ? ` · ${e.roadStatus}` : ""}
                </text>
              </g>
            );
          })}
          {route && (
            <polyline
              points={route.geometry.coordinates
                .map(([longitude, latitude]) => {
                  const p = project({ longitude, latitude });
                  return `${p.x},${p.y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#2563eb"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {shelters.map((s) => {
            const p = project(s);
            return (
              <g
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={s.name}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
                className="map-marker"
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={selected === s.id ? 21 : 17}
                  fill={selected === s.id ? "#2563eb" : "#fff"}
                  stroke="#2563eb"
                  strokeWidth="2"
                />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fill={selected === s.id ? "white" : "#2563eb"}
                  fontSize="15"
                >
                  ⌂
                </text>
                <text
                  x={p.x}
                  y={p.y - 29}
                  textAnchor="middle"
                  fill="#405761"
                  fontSize="11"
                >
                  {s.name.replace("（架空）", "")}
                </text>
              </g>
            );
          })}
          <circle
            cx={origin.x}
            cy={origin.y}
            r="25"
            fill="#2563eb"
            opacity=".12"
          />
          <circle
            cx={origin.x}
            cy={origin.y}
            r="9"
            fill="#2563eb"
            stroke="white"
            strokeWidth="4"
          />
          <text
            x={origin.x}
            y={origin.y + 38}
            textAnchor="middle"
            fontSize="12"
            fill="#405761"
          >
            {language === "ja" ? "出発点" : "Start"}
          </text>
        </svg>
      )}
      <div className="map-mode">
        {map ? "Google Maps + 架空道路網" : "SCHEMATIC MAP · 模式図"}
      </div>
      <div className="map-legend">
        <span>
          <i className="blue" />
          経路候補
        </span>
        <span>
          <i className="red" />
          通行不可
        </span>
        <span>
          <i className="amber" />
          規制・未確認
        </span>
      </div>
    </div>
  );
}
