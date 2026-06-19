/**
 * Typed, validated access to required environment variables.
 *
 * Importing this module is side-effect free; call {@link getEnv} (or one of the
 * accessor helpers) to read a value. Validation happens lazily and fails fast with a
 * clear message listing every missing variable — never a cryptic crash deep in a handler.
 */

export interface Env {
  MONGODB_URI: string;
  IGDB_CLIENT_ID: string;
  IGDB_CLIENT_SECRET: string;
}

const REQUIRED_VARS = ['MONGODB_URI', 'IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET'] as const;

/**
 * Read and validate the environment. Throws if any required variable is missing or empty.
 * Accepts an optional source map for testability (defaults to `process.env`).
 */
export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = source[key];
    if (value === undefined || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in .env locally and in the Vercel project settings for production.',
    );
  }

  return {
    MONGODB_URI: source.MONGODB_URI as string,
    IGDB_CLIENT_ID: source.IGDB_CLIENT_ID as string,
    IGDB_CLIENT_SECRET: source.IGDB_CLIENT_SECRET as string,
  };
}
