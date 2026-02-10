import type { Coordinates } from "../types";

const OPENCAGE_BASE_URL = "https://api.opencagedata.com/geocode/v1/json";
const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;

type OpenCageResultEntry = {
  formatted?: unknown;
  geometry?: {
    lat?: unknown;
    lng?: unknown;
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
  apiKey: string,
  options: {
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<OpenCageSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error("Missing OpenCage API key.");
  }

  const params = new URLSearchParams({
    q: trimmedQuery,
    key: trimmedApiKey,
    no_annotations: "1",
    limit: String(normalizeLimit(options.limit)),
  });

  const requestInit: RequestInit = {};
  if (options.signal) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(`${OPENCAGE_BASE_URL}?${params.toString()}`, requestInit);

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
