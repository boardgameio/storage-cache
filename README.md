# bgio-storage-cache

[![NPM Version](https://img.shields.io/npm/v/bgio-storage-cache)](https://www.npmjs.com/package/bgio-storage-cache)
[![Build Status](https://travis-ci.com/delucis/bgio-storage-cache.svg?branch=latest)](https://travis-ci.com/delucis/bgio-storage-cache)
[![Coverage Status](https://coveralls.io/repos/github/delucis/bgio-storage-cache/badge.svg?branch=latest)](https://coveralls.io/github/delucis/bgio-storage-cache?branch=latest)

>  🔌  A caching layer for [boardgame.io][bgio] database connectors

This package provides a wrapper for boardgame.io storage implementations,
adding an in-memory cache for the most recently used data.

The cache expects all interactions with the underlying database to pass
through it, so it is not appropriate for situations where you may have
multiple processes or server instances. There are also limitations to what can be reliably cached: listing all games will always require a call to your database.

## Installation

```sh
npm install --save bgio-storage-cache
```


## Usage

Instantiate your database class as usual and pass it to `StorageCache`. This example uses the [flat-file storage solution][ffdb] bundled with boardgame.io.

```js
const { Server, FlatFile } = require('boardgame.io/server');
const { StorageCache } = require('bgio-storage-cache');
const { MyGame } = require('./game');

// instantiate the database class
const db = new FlatFile({ dir: '/storage/directory' });

// wrap the database with the caching layer
const dbWithCaching = new StorageCache(db, { cacheSize: 200 });

// pass the wrapped database to the boardgame.io server
const server = Server({
  games: [MyGame],
  db: dbWithCaching,
});

server.run(8000);
```


## API

### `new StorageCache(database[, options])`

#### `database`

- **type:** [`StorageAPI.Async`][async] instance

An instance of a class implementing [the boardgame.io storage API][bgio-storage].

#### `options`

- **type:** `object`
- **default:** `{}`

An options object configuring the cache:

```js
{
  /**
   * The number of games to cache in memory.
   * @type {number}
   * @default 1000
   */
  cacheSize: 1000,
}
```


## Contributing

Bug reports, suggestions, and pull requests are very welcome! If you run into any problems or have questions, please [open an issue][newissue].

Please also note [the code of conduct][COC] and be kind to each other.


## License

The code in this repository is provided under [the MIT License](LICENSE).


[bgio]: https://boardgame.io/
[ffdb]: https://boardgame.io/documentation/#/storage?id=flatfile
[async]: https://github.com/nicolodavis/boardgame.io/blob/master/src/server/db/base.ts
[bgio-storage]: https://boardgame.io/documentation/#/storage
[newissue]: https://github.com/delucis/bgio-storage-cache/issues/new/choose
[COC]: CODE_OF_CONDUCT.md
