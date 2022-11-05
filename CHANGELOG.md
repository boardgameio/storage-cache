# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.6.0](https://github.com/boardgameio/storage-cache/compare/v0.5.0...v0.6.0) (2022-11-05)

## [0.5.0](https://github.com/boardgameio/storage-cache/compare/v0.4.0...v0.5.0) (2022-02-24)

## [0.4.0](https://github.com/boardgameio/storage-cache/compare/v0.3.3...v0.4.0) (2021-12-12)


### ⚠ BREAKING CHANGES

* Node 10 is no longer officially supported. The package itself has not changed, so
should continue to work in Node 10, but we aren’t testing against 10 anymore, so that may break at
any time from now on without notice.

### ci

* drop Node 10 & 15, add Node 16 ([695d789](https://github.com/boardgameio/storage-cache/commit/695d789f199e107041dd8c901834c8b640e57865))

### [0.3.3](https://github.com/boardgameio/storage-cache/compare/v0.3.2...v0.3.3) (2021-11-19)

### [0.3.2](https://github.com/boardgameio/storage-cache/compare/v0.3.1...v0.3.2) (2021-08-03)

### [0.3.1](https://github.com/boardgameio/storage-cache/compare/v0.3.0...v0.3.1) (2021-04-28)

## [0.3.0](https://github.com/boardgameio/storage-cache/compare/v0.2.1...v0.3.0) (2020-10-20)


### ⚠ BREAKING CHANGES

* Versions of boardgame.io <0.41.1 are no longer 
supported and other uses that directly relied on calling `listGames` or 
`createGame` will need to be updated to use the new `listMatches` and 
`createMatch` method names.

### Features

* upgrade boardgame.io and handle both new and deprecated storage class methods ([5650cbe](https://github.com/boardgameio/storage-cache/commit/5650cbe620aa4d4bc0a26eae1f99e1ce50792ed9)), closes [#3](https://github.com/boardgameio/storage-cache/issues/3)

### [0.2.1](https://github.com/boardgameio/storage-cache/compare/v0.2.0...v0.2.1) (2020-10-20)


### Bug Fixes

* **package:** Indicate lack of support for boardgame.io@0.41 ([e11c7d9](https://github.com/boardgameio/storage-cache/commit/e11c7d988b6f01a5433ce40ae0cb7711c4ff8806))

## [0.2.0](https://github.com/boardgameio/storage-cache/compare/v0.1.3...v0.2.0) (2020-09-26)


### ⚠ BREAKING CHANGES

* The minimum supported version of boardgame.io is now 0.40.0. Please use
bgio-storage-cache@^0.1.3 if you are using an older version of boardgame.io.

### Features

* make module compatible with boardgame.io@^0.40.0 ([2c4bef7](https://github.com/boardgameio/storage-cache/commit/2c4bef742ea08b1b2c38080dd03bf8830ab661b1))

### [0.1.3](https://github.com/boardgameio/storage-cache/compare/v0.1.2...v0.1.3) (2020-09-26)

### [0.1.2](https://github.com/boardgameio/storage-cache/compare/v0.1.1...v0.1.2) (2020-03-30)

### [0.1.1](https://github.com/boardgameio/storage-cache/compare/v0.1.0...v0.1.1) (2020-03-30)

## 0.1.0 (2020-03-30)


### Features

* Initial commit ([e5a2199](https://github.com/boardgameio/storage-cache/commit/e5a2199d3e59a986fdc47b79a1499a25eed80317))
