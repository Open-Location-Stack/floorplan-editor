export type RuntimeConfig = {
  maptilerApiKey: string;
};

export type RuntimeConfigResult =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; error: string };

export const getRuntimeConfig = (): RuntimeConfigResult => {
  const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    return {
      ok: false,
      error:
        "Missing VITE_MAPTILER_API_KEY. Add it to your environment (see .env.example) to enable map rendering.",
    };
  }

  return {
    ok: true,
    config: {
      maptilerApiKey: apiKey,
    },
  };
};
