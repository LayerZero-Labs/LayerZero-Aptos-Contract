# Building on LayerZero

It is simple to build your own applications (aka `UA`) on LayerZero. You just need to integrate your UA with three interfaces of Endpoint:

- register_ua()
- send()
- lz_receive()

## Register UA
Before sending messages on LayerZero, you need to register your UA. 

```move
public fun register_ua<UA>(account: &signer): UaCapability<UA>
```

The `UA` type is an identifier of your application. You can use any type as `UA`, e.g. `0x1::MyApp::MyApp` as UA.
Note: only one UA is allowed per address. That means there won't two `UA` types share the same address.

When calling `register_ua()`, you will get a `UaCapability<UA>` as return. It is the resources for authenticating any LayerZero functions, such as sending messages and setting configurations. 

## Send Messages

To send a message, call the Endpoint's `send()` function. 

```move
public fun send<UA>(
    dst_chain_id: u64,
    dst_address: vector<u8>,
    payload: vector<u8>,
    native_fee: Coin<AptosCoin>,
    zro_fee: Coin<ZRO>,
    adapter_params: vector<u8>,
    msglib_params: vector<u8>,
    _cap: &UaCapability<UA>
): (u64, Coin<AptosCoin>, Coin<ZRO>)
```

You can send any message (`payload`) to any address on any chain and pay fee with `AptosCoin`. So far we only support `AptosCoin` as fee.
`ZRO` coin will be supported to pay the protocol fee in the future.

The `msglib_params` is for passing parameters to the message libraries. So far, it is not used and can be empty.

### Estimate Fee

If you want to know how much `AptosCoin` to pay for the message, you can call the Endpoint's `quote_fee()` to get the fee tuple (native_fee (in coin<AptosCoin>), layerzero_fee (in coin<ZRO>)).

```move
#[view]
public fun quote_fee(
    ua_address: address,
    dst_chain_id: u64,
    payload_size: u64,
    pay_in_zro: bool,
    adapter_params: vector<u8>,
    msglib_params: vector<u8>
): (u64, u64)
```


## Receive Messages

Your UA has to provide a public entry function `lz_receive()` for executors to receive messages from other chains and execute your business logic.

```move
public entry fun lz_receive<Type1, Type2, ...>(src_chain_id: u64, src_address: vector<u8>, payload: vector<u8>)
```

The `lz_receive()` function has to call the Endpoint's `lz_receive()` function to verify the payload and get the nonce.

```move
// endpoint's lz_receive()
public fun lz_receive<UA>(
    src_chain_id: u64,
    src_address: vector<u8>,
    payload: vector<u8>,
    _cap: &UaCapability<UA>
): u64
```

When an executor calls your UA's `lz_receive()`, it needs to know what generic types `<Type1, Type2, ...>` to use for consuming the payload.
So if your UA needs those types, you also need to provide a public entry function `lz_receive_types()` to return the types.

NOTES: make sure to assert the provided types against the payload. For example, if the payload indicates coinType A, then the provided coinType must be A. 

```move
#[view]
public fun lz_receive_types(src_chain_id: u64, src_address: vector<u8>, payload: vector<u8>): vector<TypeInfo>
```

### Blocking Mode

Layerzero is by default BLOCKING, which means if the message payload fails in the lz_receive function,
your UA will be blocked and cannot receive next messages from that path until the failed message is received successfully.
For that case, you may have to drop the message or store it and retry later. We provide [LzApp Modules](#LzApp-Modules) to help you handle it.


## UA Custom Config

You can also customize your UA's configurations, e.g. message library, relayer and oracle, etc.

```move
public fun set_config<UA>(
    major_version: u64,
    minor_version: u8,
    chain_id: u64,
    config_type: u8,
    config_bytes: vector<u8>,
    _cap: &UaCapability<UA>
)

public fun set_send_msglib<UA>(chain_id: u64, major_version: u64, minor_version: u8, _cap: &UaCapability<UA>)

public fun set_receive_msglib<UA>(chain_id: u64, major_version: u64, minor_version: u8, _cap: &UaCapability<UA>)

public fun set_executor<UA>(chain_id: u64, version: u64, executor: address, _cap: &UaCapability<UA>)
```

## LzApp Modules

We provide some common modules to help build your UAs to let you put more focus on your business logic.
Those modules provide many useful functions that are commonly used in most UAs. You can just use them directly
that are already deployed by LayerZero, or you can copy them to your own modules and modify them to fit your needs.

- [lzapp.move](../layerzero/sources/app/lzapp/lzapp.move)
- [remote.move](../layerzero/sources/app/lzapp/remote.move)

### LzApp

LZApp module provides a simple way for you to manage your UA's configurations and handle error messages.
1. provides entry functions to config instead of calling from app with UaCapability
2. allows the app to drop/store the next payload
3. enables to send lz message with both Aptos coin and with ZRO coin, or only Aptos coin

It is very simple to use it by initializing it by calling `fun init<UA>(account: &signer, cap: UaCapability<UA>)` in your UA.

## Examples:
- [OmniCounter](counter/sources/counter.move)
- [TokenBridge](bridge/sources/bridge.move)