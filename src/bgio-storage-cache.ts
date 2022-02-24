/*
 * Copyright 2017–20 Chris Swithinbank & the boardgame.io Authors.
 *
 * Use of this source code is governed by a MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import LRU from 'lru-cache';
import { Server, State, LogEntry, StorageAPI } from 'boardgame.io';
import { Async } from 'boardgame.io/internal';

/**
 * boardgame.io database connector wrapper that caches data.
 */
export class StorageCache extends Async {
  cache: {
    metadata: LRU<string, Server.MatchData>;
    state: LRU<string, State>;
    initialState: LRU<string, State>;
    log: LRU<string, LogEntry[]>;
    reset: () => void;
  };
  db: StorageAPI.Async;

  /**
   * Wraps a boardgame.io database connector, adding a caching layer.
   * @param db - Instance of a database connector.
   * @param opts - Options object.
   * @constructor
   */
  constructor(
    db: StorageAPI.Async,
    { cacheSize = 1000 }: { cacheSize?: number } = {}
  ) {
    super();
    this.db = db;
    this.cache = {
      metadata: new LRU({ max: cacheSize }),
      state: new LRU({ max: cacheSize }),
      initialState: new LRU({ max: cacheSize }),
      log: new LRU({ max: cacheSize }),
      reset: (): void => {
        this.cache.metadata.clear();
        this.cache.state.clear();
        this.cache.initialState.clear();
        this.cache.log.clear();
      },
    };
  }

  /**
   * Connect to the instance.
   */
  async connect(): Promise<void> {
    await this.db.connect();
  }

  /**
   * Create database entries for a new game.
   * @param gameID - The game ID to key entries by.
   * @param opts - Object containing initial metadata & state objects.
   */
  async createMatch(
    gameID: string,
    opts: StorageAPI.CreateMatchOpts
  ): Promise<void> {
    this.cache.metadata.set(gameID, opts.metadata);
    this.cache.state.set(gameID, opts.initialState);
    this.cache.initialState.set(gameID, opts.initialState);
    this.cache.log.set(gameID, []);
    // Use the deprecated `createGame` method if the database implements it.
    if (this.db.createGame) {
      await this.db.createGame(gameID, opts);
    } else {
      await this.db.createMatch(gameID, opts);
    }
  }

  /**
   * Write the game state.
   * @param gameID - The game id.
   * @param store - A game state to persist.
   * @param deltalog - Array of log entries to append to the game log.
   */
  async setState(
    gameID: string,
    state: State,
    deltalog?: LogEntry[]
  ): Promise<void> {
    // bail if cached state is newer than or same as state argument
    const cachedState = this.cache.state.get(gameID);
    if (cachedState && cachedState._stateID >= state._stateID) return;
    // append deltalog to log
    if (deltalog && deltalog.length > 0) {
      let log = this.cache.log.get(gameID);
      if (!log) ({ log } = await this.db.fetch(gameID, { log: true }));
      if (!log) log = [];
      this.cache.log.set(gameID, log.concat(deltalog));
    }
    // update state
    this.cache.state.set(gameID, state);
    await this.db.setState(gameID, state, deltalog);
  }

  /**
   * Write the game metadata.
   * @param gameID - The game id.
   * @param metadata - The game metadata to persist.
   */
  async setMetadata(gameID: string, metadata: Server.MatchData): Promise<void> {
    this.cache.metadata.set(gameID, metadata);
    await this.db.setMetadata(gameID, metadata);
  }

  /**
   * Read database values for a game.
   * @param gameID - The game id.
   * @param opts - A map of boolean values for the data types to return.
   * @returns - A map containing the database value for data types true in opts.
   */
  async fetch<O extends StorageAPI.FetchOpts>(
    gameID: string,
    opts: O
  ): Promise<StorageAPI.FetchResult<O>> {
    const result = {} as StorageAPI.FetchFields;
    const fetchFromDb: StorageAPI.FetchOpts = {};

    // Retrieve requested fields from cache and if not present,
    // flag that they should be fetched from the database.
    const fetchFields = ['metadata', 'state', 'initialState', 'log'] as const;
    for (const key of fetchFields) {
      if (opts[key]) {
        const cacheValue = this.cache[key].get(gameID);
        if (cacheValue) {
          result[key] = cacheValue as State & LogEntry[] & Server.MatchData;
        } else {
          fetchFromDb[key] = true;
        }
      }
    }

    // Fetch and handle uncached fields from the database instance.
    if (Object.keys(fetchFromDb).length > 0) {
      const response = await this.db.fetch(gameID, fetchFromDb);

      // handle fields that don’t need additional race condition checks
      const simpleFields = ['metadata', 'initialState', 'log'] as const;
      for (const field of simpleFields) {
        const val = response[field] as State & LogEntry[] & Server.MatchData;
        if (val) {
          this.cache[field].set(gameID, val);
          result[field] = val;
        }
      }

      // handle state response
      if (response.state) {
        const { state } = response;
        const newStateID: number = state._stateID || -1;

        // check if cache has been updated in the meantime
        const cachedState = this.cache.state.get(gameID);
        const oldStateID = cachedState?._stateID || 0;

        if (!cachedState) {
          // Cache is still empty, so update it and return database value.
          this.cache.state.set(gameID, state);
          result.state = state;
        } else if (newStateID >= oldStateID) {
          // The database value is newer than the cached value.
          // A race condition might overwrite the cache
          // while fetching state, so we need this check.
          this.cache.state.set(gameID, state);
          result.state = state;
        } else {
          // The cached value is newer than the database value,
          // so return the cached value.
          result.state = cachedState;
        }
      }
    }

    return result as StorageAPI.FetchResult<O>;
  }

  /**
   * Remove all values from the database for a specific game.
   * @param gameID - The game ID to delete data for.
   */
  async wipe(gameID: string): Promise<void> {
    await this.db.wipe(gameID);
    this.cache.metadata.delete(gameID);
    this.cache.state.delete(gameID);
    this.cache.initialState.delete(gameID);
    this.cache.log.delete(gameID);
  }

  /**
   * Return all gameIDs.
   * @returns - Array of gameIDs (strings)
   */
  async listMatches(opts?: StorageAPI.ListMatchesOpts): Promise<string[]> {
    // Use the deprecated `listGames` method if the database implements it.
    return this.db.listGames
      ? this.db.listGames(opts)
      : this.db.listMatches(opts);
  }
}
