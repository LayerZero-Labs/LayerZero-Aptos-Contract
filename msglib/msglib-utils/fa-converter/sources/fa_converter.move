module fa_converter::fa_converter {
    use std::coin::{Self, Coin};
    use std::fungible_asset::{Self, FungibleAsset};
    use std::object;
    use std::option::{Self, Option};
    use std::primary_fungible_store;

    /// Convert a coin to a fungible asset
    public fun coin_to_fungible_asset<CoinType>(coin: Coin<CoinType>): FungibleAsset {
        coin::coin_to_fungible_asset(coin)
    }

    /// Convert a coin to an fungible asset if the coin is non-zero, otherwise destroy the coin and return none
    public fun coin_to_optional_fungible_asset<CoinType>(coin: Coin<CoinType>): Option<FungibleAsset> {
        if (coin::value(&coin) > 0) {
            option::some(coin_to_fungible_asset(coin))
        } else {
            coin::destroy_zero(coin);
            option::none<FungibleAsset>()
        }
    }

    /// Convert a fungible asset to a coin by depositing the fungible asset into a temporary object
    /// and then withdrawing a coin from it
    public fun fungible_asset_to_coin<CoinType>(fa: FungibleAsset): Coin<CoinType> {
        // Ensure the fungible asset is paired with the coin type
        let coin_paired_metadata = coin::paired_metadata<CoinType>();
        let fa_metadata = fungible_asset::asset_metadata(&fa);
        assert!(option::is_some(&coin_paired_metadata), ENOT_COIN_PAIRED);
        assert!(option::destroy_some(coin_paired_metadata) == fa_metadata, EFA_COIN_PAIR_MISMATCH);

        // Deposit the fungible asset into the object
        let amount = fungible_asset::amount(&fa);
        let obj_ref = object::create_object(@fa_converter);
        let addr = object::address_from_constructor_ref(&obj_ref);
        primary_fungible_store::deposit(addr, fa);

        // Withdraw the coin from the object
        let signer = object::generate_signer(&obj_ref);
        let coin = coin::withdraw<CoinType>(&signer, amount);

        // Delete the object
        let del_ref = object::generate_delete_ref(&obj_ref);
        object::delete(del_ref);

        coin
    }

    public fun optional_fungible_asset_to_coin<CoinType>(fa: Option<FungibleAsset>): Coin<CoinType> {
        if (option::is_some(&fa)) {
            fungible_asset_to_coin<CoinType>(option::destroy_some(fa))
        } else {
            option::destroy_none(fa);
            coin::zero<CoinType>()
        }
    }

    // ================================================== Error Codes =================================================

    const ENOT_COIN_PAIRED: u64 = 1;
    const EFA_COIN_PAIR_MISMATCH: u64 = 2;
}
