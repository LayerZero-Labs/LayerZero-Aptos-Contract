# LayerZero Aptos

LayerZero Aptos endpoint.

## Development Guide

- [Building on LayerZero](apps/README.md)

## Setup

```shell
git submodule init
git submodule update --recursive

cargo install --path deps/aptos-core/crates/aptos
```

## Running tests

### move modules

run tests of move modules

```shell
make test
```

### SDK

to run tests of SDK, we need to launch local testnet first,

```shell
aptos node run-local-testnet --force-restart --assume-yes --with-faucet
```

then execute tests
```shell
cd sdk
npx jest ./tests/omniCounter.test.ts
npx jest ./tests/bridge.test.ts
```
