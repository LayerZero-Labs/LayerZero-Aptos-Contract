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
