import { describe, expect, it } from 'vitest';

import { getEnv } from './env';

describe('getEnv', () => {
  const complete = {
    MONGODB_URI: 'mongodb://localhost:27017',
    IGDB_CLIENT_ID: 'id',
    IGDB_CLIENT_SECRET: 'secret',
  };

  it('returns a typed env object when all vars are present', () => {
    expect(getEnv(complete)).toEqual(complete);
  });

  it('throws listing every missing variable', () => {
    expect(() => getEnv({})).toThrow(
      /MONGODB_URI.*IGDB_CLIENT_ID.*IGDB_CLIENT_SECRET/,
    );
  });

  it('treats empty/whitespace values as missing', () => {
    expect(() => getEnv({ ...complete, IGDB_CLIENT_SECRET: '   ' })).toThrow(/IGDB_CLIENT_SECRET/);
  });
});
