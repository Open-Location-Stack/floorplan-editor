const OPENCAGE_BASE_URL = "https://api.opencagedata.com/geocode/v1/json";
const DEFAULT_RESULT_LIMIT = 5;
const MAX_RESULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 200;

type Env = {
  OPENCAGE_API_KEY?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

const jsonError = (message: string, status: number): Response =>
  Response.json(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    },
  );

const normalizeLimit = (value: string | null): number => {
  const parsed = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RESULT_LIMIT;
  }

  return Math.min(MAX_RESULT_LIMIT, Math.max(1, Math.round(parsed)));
};

export const onRequestGet = async ({ request, env }: PagesContext): Promise<Response> => {
  const apiKey = env.OPENCAGE_API_KEY?.trim();
  if (!apiKey) {
    return jsonError("Geocoding is not configured.", 503);
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("key")) {
    return jsonError("Client API keys are not accepted.", 400);
  }

  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_QUERY_LENGTH) {
    return jsonError("A valid geocoding query is required.", 400);
  }

  const upstreamParams = new URLSearchParams({
    q: query,
    key: apiKey,
    no_annotations: "1",
    limit: String(normalizeLimit(requestUrl.searchParams.get("limit"))),
  });

  try {
    const upstream = await fetch(`${OPENCAGE_BASE_URL}?${upstreamParams.toString()}`);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return jsonError("Geocoding service is unavailable.", 502);
  }
};
