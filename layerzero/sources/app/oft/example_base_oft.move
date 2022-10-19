// the example is to show how to enable an existing coin to become an OFT without prioviding mint and burn capabilities.
#[test_only]
module test::example_base_oft {
    use layerzero::endpoint::UaCapability;
    use layerzero::oft;
    use test::moon_coin::MoonCoin;

    struct Capabilities has key {
        lz_cap: UaCapability<MoonCoin>,
    }

    fun init_module(account: &signer) {
        let lz_cap = oft::init_base_oft<MoonCoin>(account);

        move_to(account, Capabilities {
            lz_cap,
        });
    }
}

// Copied from MoonCoin::moon_coin
#[test_only]
module test::moon_coin {
    struct MoonCoin {}

    fun init_module(sender: &signer) {
        aptos_framework::managed_coin::initialize<MoonCoin>(
            sender,
            b"Moon Coin",
            b"MOON",
            6,
            false,
        );
    }
}