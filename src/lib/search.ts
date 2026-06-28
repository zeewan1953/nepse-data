export type Item = {
  id: string;
  title: string;
  url: string;
  place?: string;
  coordinates?: { lat: number; lng: number };
  raw?: Record<string, unknown>;
};

type ResultStats = {
  searchResults: Item[];
  totalHitsCache: number;
  usedCache: boolean;
  usedLocationFallback: boolean;
  pendingRetry: boolean;
  lastUpdated: number;
  error?: string;
};

const MAX_RESULTS = 300;

const DEFAULT_COORDINATES: [number, number] = [26.91654, 87.27936];

let state: ResultStats = {
  searchResults: [],
  totalHitsCache: 0,
  usedCache: false,
  usedLocationFallback: false,
  pendingRetry: false,
  lastUpdated: 0,
};

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export const router = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getState() {
    return state;
  },
  reset() {
    state = {
      searchResults: [],
      totalHitsCache: 0,
      usedCache: false,
      usedLocationFallback: false,
      pendingRetry: false,
      lastUpdated: 0,
    };
    notify();
  },
};

export function buildBoundingBox(center: [number, number], radiusKm = 20): string {
  const [lat, lng] = center;
  const latDelta = radiusKm / 110.574;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return `${lat - latDelta},${lng - lngDelta},${lat + latDelta},${lng + lngDelta}`;
}

export function getDistanceKm(
  from: [number, number],
  to: [number, number] = DEFAULT_COORDINATES
): number {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normaliseItem(item: Record<string, unknown>): Item | null {
  if (!item || typeof item !== "object") return null;
  const title =
    typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : typeof item.place_name === "string"
        ? item.place_name.trim()
        : "";
  if (!title) return null;

  const centerArr = item.center as number[] | undefined;
  const coordsObj = item.coordinates as Record<string, unknown> | undefined;
  const coordinates = centerArr
    ? { lat: centerArr[1], lng: centerArr[0] }
    : coordsObj
      ? { lat: (coordsObj.lat as number) || (coordsObj.latitude as number) || 0, lng: (coordsObj.lng as number) || (coordsObj.longitude as number) || 0 }
      : undefined;

  const context = Array.isArray(item.context)
    ? item.context
        .filter((c: { text?: string }) => typeof c.text === "string")
        .map((c: { text: string }) => c.text)
    : [];

  return {
    id:
      (typeof item.id === "string" && item.id) ||
      `${title}-${coordinates?.lat ?? ""}-${coordinates?.lng ?? ""}`,
    title,
    url: typeof item.url === "string" ? item.url : "",
    place:
      (typeof item.place_name === "string" && item.place_name) ||
      context.join(", ") ||
      undefined,
    coordinates,
    raw: context.length ? { context } : undefined,
  };
}

export async function* searchItems(query: string, forceLocation = false): AsyncGenerator<Item> {
  if (!query || query.trim().length < 2) {
    yield* [];
    return;
  }
  const q = query.trim();

  const token = forceLocation
    ? "token"
    : "token";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let center: [number, number] | undefined;
  if (forceLocation) {
    center = DEFAULT_COORDINATES;
  }

  const bbox = center ? buildBoundingBox(center) : undefined;
  const url = new URL("https://api.mapbox.com/geocoding/v5/mapbox.places/");
  url.searchParams.set("query", q);
  url.searchParams.set("limit", String(10));
  url.searchParams.set("language", "ne,en");
  url.searchParams.set("country", "NP");
  url.searchParams.set("types", "place,locality,poi,address");
  if (center) {
    url.searchParams.set("proximity", `${center[0]},${center[1]}`);
    url.searchParams.set("radius", String(20000));
  }
  if (bbox) {
    url.searchParams.set("bbox", bbox);
  }
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      `Mapbox search failed: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`
    );
    throw error;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const features = Array.isArray((payload as { features?: unknown[] }).features)
    ? ((payload as { features: unknown[] }).features as Record<string, unknown>[])
    : [];

  const batch: Item[] = [];
  for (const feature of features) {
    const item = normaliseItem(feature);
    if (!item) continue;
    batch.push(item);
    if (batch.length >= 10) {
      for (const item of batch.splice(0, batch.length)) {
        yield item;
      }
    }
  }
  for (const item of batch) {
    yield item;
  }
}

export async function search(query: string, forceLocation = false): Promise<ResultStats> {
  if (!query || query.trim().length < 2) {
    return (state = { ...state, searchResults: [], totalHitsCache: 0, usedCache: false, pendingRetry: false, error: undefined, lastUpdated: Date.now() });
  }

  const batch: Item[] = [];
  try {
    for await (const item of searchItems(query, forceLocation)) {
      batch.push(item);
      if (batch.length >= MAX_RESULTS) break;
    }

    state = {
      ...state,
      searchResults: batch,
      totalHitsCache: batch.length,
      usedCache: false,
      pendingRetry: false,
      error: undefined,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    state = {
      ...state,
      searchResults: [],
      totalHitsCache: state.totalHitsCache,
      usedCache: true,
      pendingRetry: true,
      error: error instanceof Error ? error.message : "Unknown search error",
      lastUpdated: Date.now(),
    };
  }

  notify();
  return state;
}

export function toExport(items: Item[]) {
  return items
    .map((item) => `${item.title}\t${item.place ?? ""}\t${item.url}`)
    .join("\n");
}
