import type { Coordinates } from "../types";

const OPENCAGE_PROXY_URL = "/api/geocode";
const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;

type OpenCageResultEntry = {
  formatted?: unknown;
  geometry?: {
    lat?: unknown;
    lng?: unknown;
  };
  components?: {
    road?: unknown;
    house_number?: unknown;
    city?: unknown;
    town?: unknown;
    village?: unknown;
    hamlet?: unknown;
    suburb?: unknown;
    state?: unknown;
    province?: unknown;
    region?: unknown;
    postcode?: unknown;
    country_code?: unknown;
  };
};

type OpenCageResponse = {
  results?: OpenCageResultEntry[];
};

export type OpenCageSearchResult = {
  id: string;
  formatted: string;
  coordinates: Coordinates;
};

export type OpenCageReverseGeocodeResult = {
  formatted: string;
  address?: string;
  locality?: string;
  province?: string;
  postal_code?: string;
  country?: string;
};

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const normalizeLimit = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.min(MAX_RESULT_LIMIT, Math.max(1, Math.round(value)));
};

export const searchOpenCage = async (
  query: string,
  options: {
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<OpenCageSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmedQuery,
    limit: String(normalizeLimit(options.limit)),
  });

  const requestInit: RequestInit = {};
  if (options.signal) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(`${OPENCAGE_PROXY_URL}?${params.toString()}`, requestInit);

  if (!response.ok) {
    throw new Error(`OpenCage request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenCageResponse;
  if (!Array.isArray(payload.results)) {
    return [];
  }

  return payload.results
    .map((entry, index): OpenCageSearchResult | undefined => {
      const formatted =
        typeof entry.formatted === "string" && entry.formatted.trim().length > 0
          ? entry.formatted
          : undefined;
      const lat = toFiniteNumber(entry.geometry?.lat);
      const lng = toFiniteNumber(entry.geometry?.lng);
      if (!formatted || lat === undefined || lng === undefined) {
        return undefined;
      }

      return {
        id: `${index}:${lng.toFixed(6)},${lat.toFixed(6)}`,
        formatted,
        coordinates: [lng, lat],
      };
    })
    .filter((entry): entry is OpenCageSearchResult => Boolean(entry));
};

export const reverseGeocodeOpenCage = async (
  coordinates: Coordinates,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<OpenCageReverseGeocodeResult | undefined> => {
  const params = new URLSearchParams({
    q: `${coordinates[1]},${coordinates[0]}`,
    limit: "1",
  });

  const requestInit: RequestInit = {};
  if (options.signal) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(`${OPENCAGE_PROXY_URL}?${params.toString()}`, requestInit);
  if (!response.ok) {
    throw new Error(`OpenCage reverse geocode failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenCageResponse;
  const first = Array.isArray(payload.results) ? payload.results[0] : undefined;
  if (!first || typeof first.formatted !== "string" || first.formatted.trim().length === 0) {
    return undefined;
  }

  const components =
    first.components && typeof first.components === "object" ? first.components : undefined;
  const road = typeof components?.road === "string" ? components.road.trim() : "";
  const houseNumber =
    typeof components?.house_number === "string" ? components.house_number.trim() : "";
  const address = [road, houseNumber].filter((part) => part.length > 0).join(" ");
  const localityCandidates = [
    components?.city,
    components?.town,
    components?.village,
    components?.hamlet,
    components?.suburb,
  ];
  const locality = localityCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  const province =
    typeof components?.state === "string" && components.state.trim().length > 0
      ? components.state.trim()
      : typeof components?.province === "string" && components.province.trim().length > 0
        ? components.province.trim()
        : typeof components?.region === "string" && components.region.trim().length > 0
          ? components.region.trim()
          : undefined;
  const postalCode =
    typeof components?.postcode === "string" && components.postcode.trim().length > 0
      ? components.postcode.trim()
      : undefined;
  const country =
    typeof components?.country_code === "string" && components.country_code.trim().length > 0
      ? components.country_code.toUpperCase()
      : undefined;

  const result: OpenCageReverseGeocodeResult = {
    formatted: first.formatted,
  };
  if (address) {
    result.address = address;
  }
  if (locality?.trim()) {
    result.locality = locality.trim();
  }
  if (province) {
    result.province = province;
  }
  if (postalCode) {
    result.postal_code = postalCode;
  }
  if (country) {
    result.country = country;
  }
  return result;
};
