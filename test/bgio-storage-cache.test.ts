/*
 * Copyright 2017–20 Chris Swithinbank & the boardgame.io Authors.
 *
 * Use of this source code is governed by a MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { directory } from 'tempy';
import { FlatFile } from 'boardgame.io/server';
import { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { StorageCache } from '../src/bgio-storage-cache';

const sleep = (t: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, t));

class LaggyDb extends FlatFile {
  private lag = 50;

  constructor(...opts: ConstructorParameters<typeof FlatFile>) {
    super(...opts);
  }

  async fetch(
    ...args: Parameters<FlatFile['fetch']>
  ): ReturnType<FlatFile['fetch']> {
    await sleep(this.lag);
    const result = await super.fetch(...args);
    await sleep(this.lag);
    return result;
  }
}

describe('construction', () => {
  test('defaults', () => {
    const dbImpl = {} as StorageAPI.Async;
    const db = new StorageCache(dbImpl);
    expect(db.db).toBe(dbImpl);
    expect(db.cache.metadata.max).toBe(1000);
    expect(db.cache.state.max).toBe(1000);
    expect(db.cache.initialState.max).toBe(1000);
    expect(db.cache.log.max).toBe(1000);
  });

  test('cacheSize', () => {
    const dbImpl = {} as StorageAPI.Async;
    const cacheSize = 200;
    const db = new StorageCache(dbImpl, { cacheSize });
    expect(db.cache.metadata.max).toBe(cacheSize);
    expect(db.cache.state.max).toBe(cacheSize);
    expect(db.cache.initialState.max).toBe(cacheSize);
    expect(db.cache.log.max).toBe(cacheSize);
  });
});

describe('StorageCache', () => {
  let db: StorageCache;

  // instantiate new database instance for each test
  beforeEach(async () => {
    const flatfile = new FlatFile({ dir: directory() });
    db = new StorageCache(flatfile);
    await db.connect();
  });

  test('must return undefined when no game exists', async () => {
    const data = await db.fetch('gameID', { state: true });
    expect(data.state).toBeUndefined();
  });

  test('cache hit', async () => {
    // Create game.
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    await db.createMatch('gameID', { initialState, metadata });

    // Must return created game.
    const data = await db.fetch('gameID', {
      state: true,
      metadata: true,
      initialState: true,
    });
    expect(data.state).toEqual(initialState);
    expect(data.initialState).toEqual(initialState);
    expect(data.metadata).toEqual(metadata);
  });

  test('cache miss', async () => {
    // Create game.
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    await db.createMatch('gameID', { initialState, metadata });

    // Must return created game after cache reset.
    db.cache.reset();
    const data = await db.fetch('gameID', {
      state: true,
      metadata: true,
      initialState: true,
    });
    expect(data.state).toEqual(initialState);
    expect(data.initialState).toEqual(initialState);
    expect(data.metadata).toEqual(metadata);
  });

  test('cache size', async () => {
    const flatfile = new FlatFile({ dir: directory() });
    const db = new StorageCache(flatfile, { cacheSize: 1 });
    await db.connect();
    await db.setState('gameID', { a: 1 } as unknown as State);
    await db.setState('another', { b: 1 } as unknown as State);
    expect(db.cache.state.size).toBe(1);
    expect([...db.cache.state.keys()]).toEqual(['another']);
  });

  test('race conditions', async () => {
    // Out of order set calls.
    await db.setState('gameID', { _stateID: 1 } as unknown as State);
    await db.setState('gameID', { _stateID: 0 } as unknown as State);
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });

    // Do not override cache on get() if it is fresher than Firebase.
    await db.setState('gameID', { _stateID: 0 } as unknown as State);
    db.cache.state.set('gameID', { _stateID: 1 } as unknown as State);
    await db.fetch('gameID', { state: true });
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });

    // Override if it is staler than Firebase.
    await db.setState('gameID', { _stateID: 1 } as unknown as State);
    db.cache.reset();
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });
    expect(db.cache.state.get('gameID')).toEqual({ _stateID: 1 });
  });

  test('deltalog is concatenated in setState', async () => {
    const id = 'gameID';
    const state = {} as unknown as State;
    await db.createMatch(id, {
      initialState: state,
      metadata: { gameName: 'A' } as Server.MatchData,
    });

    // expect log to be initialised as an empty array
    let { log } = await db.fetch(id, { log: true });
    expect(log).toEqual([]);

    const entry1 = {
      action: {
        type: 'MAKE_MOVE',
      },
    } as LogEntry;
    await db.setState(id, state, [entry1]);

    // expect log to have entry 1 added to it
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1]);

    const entry2 = {
      action: {
        type: 'GAME_EVENT',
      },
    } as LogEntry;
    await db.setState(id, state, [entry2]);

    // expect log to have entry 2 added to it
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1, entry2]);

    // if the cache is empty, the log should be retrieved from the database
    db.cache.reset();
    await db.setState(id, state, [entry1]);
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1, entry2, entry1]);
  });

  test('setting state will create a log if it doesn’t exist yet', async () => {
    const id = 'gameID';
    const state = {} as unknown as State;
    const entry = {
      action: {
        type: 'MAKE_MOVE',
      },
    } as LogEntry;
    await db.setState(id, state, [entry]);
    const { log } = await db.fetch(id, { log: true });
    expect(log).toEqual([entry]);
  });

  test('list all entries', async () => {
    // Insert 3 entries
    await db.setMetadata('gameID_0', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_2', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_1', { gameName: 'B' } as Server.MatchData);
    const ids = await db.listMatches();
    expect(ids).toContain('gameID_0');
    expect(ids).toContain('gameID_1');
    expect(ids).toContain('gameID_2');
  });

  test('list entries for specific gameName', async () => {
    await db.setMetadata('gameID_0', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_2', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_1', { gameName: 'B' } as Server.MatchData);
    const ids = await db.listMatches({ gameName: 'A' });
    expect(ids).toContain('gameID_0');
    expect(ids).toContain('gameID_2');
    expect(ids).not.toContain('gameID_1');
  });

  test('remove entry', async () => {
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    // Insert 2 entries
    await db.createMatch('gameID_0', { initialState, metadata });
    await db.createMatch('gameID_1', { initialState, metadata });
    // Remove 1
    await db.wipe('gameID_1');
    const games = await db.listMatches();
    expect(games).toContain('gameID_0');
    expect(games).not.toContain('gameID_1');
    await db.wipe('gameID_1');
  });

  describe('race condition where cache is filled during fetch', () => {
    const matchID = 'matchID';

    beforeEach(async () => {
      const flatfile = new LaggyDb({ dir: directory() });
      db = new StorageCache(flatfile);
      await db.connect();
      await db.setState(matchID, { _stateID: 0 } as unknown as State);
      db.cache.reset();
    });

    test('cache updated with newer state than database return', async () => {
      // Request latest state.
      const result = db.fetch(matchID, { state: true });
      // Once database has resolved, but before laggy wrapper returns,
      // advance state to a newer value.
      await sleep(75);
      await db.setState(matchID, { _stateID: 1 } as unknown as State);
      // The newer cached value should be returned.
      expect((await result).state._stateID).toBe(1);
    });

    test('cache updated with older state than database return', async () => {
      // Advance state.
      await db.setState(matchID, { _stateID: 2 } as unknown as State);
      db.cache.reset();
      // Request latest state.
      const result = db.fetch(matchID, { state: true });
      // Once database has resolved, but before laggy wrapper returns,
      // erroneously set state to an older value.
      await sleep(75);
      await db.setState(matchID, { _stateID: 1 } as unknown as State);
      // The newer database value should still be returned.
      expect((await result).state._stateID).toBe(2);
    });
  });
});

describe('StorageCache with a deprecated database connector', () => {
  let db: StorageCache;

  /**
   * Storage implementation with deprecated methods on top of FlatFile.
   */
  class DeprecatedStorage extends FlatFile {
    constructor() {
      super({ dir: directory() });
    }

    async createGame(
      id: string,
      opts: StorageAPI.CreateGameOpts
    ): Promise<void> {
      return this.createMatch(id, opts);
    }

    async listGames(opts?: StorageAPI.ListGamesOpts): Promise<string[]> {
      return this.listMatches(opts);
    }
  }

  // instantiate new database instance for each test
  beforeEach(async () => {
    const storage = new DeprecatedStorage();
    db = new StorageCache(storage);
    await db.connect();
  });

  test('must return undefined when no game exists', async () => {
    const data = await db.fetch('gameID', { state: true });
    expect(data.state).toBeUndefined();
  });

  test('cache hit', async () => {
    // Create game.
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    await db.createMatch('gameID', { initialState, metadata });

    // Must return created game.
    const data = await db.fetch('gameID', {
      state: true,
      metadata: true,
      initialState: true,
    });
    expect(data.state).toEqual(initialState);
    expect(data.initialState).toEqual(initialState);
    expect(data.metadata).toEqual(metadata);
  });

  test('cache miss', async () => {
    // Create game.
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    await db.createMatch('gameID', { initialState, metadata });

    // Must return created game after cache reset.
    db.cache.reset();
    const data = await db.fetch('gameID', {
      state: true,
      metadata: true,
      initialState: true,
    });
    expect(data.state).toEqual(initialState);
    expect(data.initialState).toEqual(initialState);
    expect(data.metadata).toEqual(metadata);
  });

  test('cache size', async () => {
    const flatfile = new FlatFile({ dir: directory() });
    const db = new StorageCache(flatfile, { cacheSize: 1 });
    await db.connect();
    await db.setState('gameID', { a: 1 } as unknown as State);
    await db.setState('another', { b: 1 } as unknown as State);
    expect(db.cache.state.size).toBe(1);
    expect([...db.cache.state.keys()]).toEqual(['another']);
  });

  test('race conditions', async () => {
    // Out of order set calls.
    await db.setState('gameID', { _stateID: 1 } as unknown as State);
    await db.setState('gameID', { _stateID: 0 } as unknown as State);
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });

    // Do not override cache on get() if it is fresher than Firebase.
    await db.setState('gameID', { _stateID: 0 } as unknown as State);
    db.cache.state.set('gameID', { _stateID: 1 } as unknown as State);
    await db.fetch('gameID', { state: true });
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });

    // Override if it is staler than Firebase.
    await db.setState('gameID', { _stateID: 1 } as unknown as State);
    db.cache.reset();
    expect(await db.fetch('gameID', { state: true })).toEqual({
      state: { _stateID: 1 },
    });
    expect(db.cache.state.get('gameID')).toEqual({ _stateID: 1 });
  });

  test('deltalog is concatenated in setState', async () => {
    const id = 'gameID';
    const state = {} as unknown as State;
    await db.createMatch(id, {
      initialState: state,
      metadata: { gameName: 'A' } as Server.MatchData,
    });

    // expect log to be initialised as an empty array
    let { log } = await db.fetch(id, { log: true });
    expect(log).toEqual([]);

    const entry1 = {
      action: {
        type: 'MAKE_MOVE',
      },
    } as LogEntry;
    await db.setState(id, state, [entry1]);

    // expect log to have entry 1 added to it
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1]);

    const entry2 = {
      action: {
        type: 'GAME_EVENT',
      },
    } as LogEntry;
    await db.setState(id, state, [entry2]);

    // expect log to have entry 2 added to it
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1, entry2]);

    // if the cache is empty, the log should be retrieved from the database
    db.cache.reset();
    await db.setState(id, state, [entry1]);
    ({ log } = await db.fetch(id, { log: true }));
    expect(log).toEqual([entry1, entry2, entry1]);
  });

  test('setting state will create a log if it doesn’t exist yet', async () => {
    const id = 'gameID';
    const state = {} as unknown as State;
    const entry = {
      action: {
        type: 'MAKE_MOVE',
      },
    } as LogEntry;
    await db.setState(id, state, [entry]);
    const { log } = await db.fetch(id, { log: true });
    expect(log).toEqual([entry]);
  });

  test('list all entries', async () => {
    // Insert 3 entries
    await db.setMetadata('gameID_0', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_2', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_1', { gameName: 'B' } as Server.MatchData);
    const ids = await db.listMatches();
    expect(ids).toContain('gameID_0');
    expect(ids).toContain('gameID_1');
    expect(ids).toContain('gameID_2');
  });

  // The FlatFile implementation doesn’t support filtering by game name
  test('list entries for specific gameName', async () => {
    await db.setMetadata('gameID_0', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_2', { gameName: 'A' } as Server.MatchData);
    await db.setMetadata('gameID_1', { gameName: 'B' } as Server.MatchData);
    const ids = await db.listMatches({ gameName: 'A' });
    expect(ids).toContain('gameID_0');
    expect(ids).toContain('gameID_2');
    expect(ids).not.toContain('gameID_1');
  });

  test('remove entry', async () => {
    const initialState = { G: 'G', ctx: 'ctx' } as unknown as State;
    const metadata = { gameName: 'A' } as Server.MatchData;
    // Insert 2 entries
    await db.createMatch('gameID_0', { initialState, metadata });
    await db.createMatch('gameID_1', { initialState, metadata });
    // Remove 1
    await db.wipe('gameID_1');
    const games = await db.listMatches();
    expect(games).toContain('gameID_0');
    expect(games).not.toContain('gameID_1');
    await db.wipe('gameID_1');
  });
});
