#[test_only]
module fa_converter::fa_converter_test {
    use std::account;
    use std::aptos_coin::{Self, AptosCoin};
    use std::coin::{Self, BurnCapability, Coin, MintCapability};
    use std::fungible_asset::{Self, FungibleAsset};
    use std::managed_coin;
    use std::option;
    use std::primary_fungible_store;
    use std::signer;
    use std::signer::address_of;

    use fa_converter::fa_converter;

    // Test coin type for unit tests
    struct FakeCoin {}

    struct AptosCoinCap has key {
        mint_cap: MintCapability<AptosCoin>,
        burn_cap: BurnCapability<AptosCoin>,
    }

    fun mint_aptos_coin_for_test(aptos: &signer, amount: u64): Coin<AptosCoin> {
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos);
        let minted_coin = coin::mint<AptosCoin>(amount, &mint_cap);
        move_to(aptos, AptosCoinCap { mint_cap, burn_cap });
        minted_coin
    }

    fun burn_aptos_coin_for_test(aptos: &signer, coin: Coin<AptosCoin>) acquires AptosCoinCap {
        let burn_cap = &borrow_global<AptosCoinCap>(signer::address_of(aptos)).burn_cap;
        coin::burn(coin, burn_cap)
    }

    fun mint_fake_coin_for_test(account: &signer, amount: u64): Coin<FakeCoin> {
        coin::create_coin_conversion_map(&account::create_account_for_test(@0x1));
        managed_coin::initialize<FakeCoin>(account, b"FakeCoin", b"FakeCoin", 8, false);
        managed_coin::register<FakeCoin>(account);
        managed_coin::mint<FakeCoin>(account, address_of(account), amount);
        coin::withdraw<FakeCoin>(account, amount)
    }

    fun deposit_fake_coin_for_test(aptos: &signer, coin: Coin<FakeCoin>) {
        coin::deposit(address_of(aptos), coin);
    }

    #[test]
    fun test_apt_to_fungible_asset() {
        let signer_address = @0x1;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a test coin with value 100
        let coin = mint_aptos_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&coin);

        // Convert coin to fungible asset
        let fungible_asset = fa_converter::coin_to_fungible_asset(coin);

        // Verify the fungible asset has the same value
        let fa_value = fungible_asset::amount(&fungible_asset);
        assert!(fa_value == initial_value, 0);

        // Clean up
        primary_fungible_store::deposit(signer_address, fungible_asset);
    }

    #[test]
    fun test_fake_coin_to_fungible_asset() {
        let signer_address = @fa_converter;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a test coin with value 100
        let coin = mint_fake_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&coin);

        // Convert coin to fungible asset
        let fungible_asset = fa_converter::coin_to_fungible_asset(coin);

        // Verify the fungible asset has the same value
        let fa_value = fungible_asset::amount(&fungible_asset);
        assert!(fa_value == initial_value, 0);

        // Clean up
        primary_fungible_store::deposit(signer_address, fungible_asset);
    }

    #[test]
    fun test_apt_to_optional_fungible_asset_some() {
        let signer_address = @0x1;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a non-zero coin
        let coin = mint_aptos_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&coin);

        // Convert to optional fungible asset
        let optional_fa = fa_converter::coin_to_optional_fungible_asset(coin);

        // Verify option is Some and contains correct value
        assert!(option::is_some(&optional_fa), 0);
        let fa = option::extract(&mut optional_fa);
        assert!(fungible_asset::amount(&fa) == initial_value, 1);

        // Clean up
        option::destroy_none(optional_fa);
        primary_fungible_store::deposit(signer_address, fa);
    }

    #[test]
    fun test_fake_coin_to_optional_fungible_asset_some() {
        let signer_address = @fa_converter;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a non-zero coin
        let coin = mint_fake_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&coin);

        // Convert to optional fungible asset
        let optional_fa = fa_converter::coin_to_optional_fungible_asset(coin);

        // Verify option is Some and contains correct value
        assert!(option::is_some(&optional_fa), 0);
        let fa = option::extract(&mut optional_fa);
        assert!(fungible_asset::amount(&fa) == initial_value, 1);

        // Clean up
        option::destroy_none(optional_fa);
        primary_fungible_store::deposit(signer_address, fa);
    }

    #[test]
    fun test_apt_to_optional_fungible_asset_none() {
        // Create a zero coin
        let coin = coin::zero<AptosCoin>();

        // Convert to optional fungible asset
        let optional_fa = fa_converter::coin_to_optional_fungible_asset(coin);

        // Verify option is None
        assert!(option::is_none(&optional_fa), 0);

        // Clean up
        option::destroy_none(optional_fa);
    }

    #[test]
    fun test_fake_coin_to_optional_fungible_asset_none() {
        // Create a zero coin
        let coin = coin::zero<FakeCoin>();

        // Convert to optional fungible asset
        let optional_fa = fa_converter::coin_to_optional_fungible_asset(coin);

        // Verify option is None
        assert!(option::is_none(&optional_fa), 0);

        // Clean up
        option::destroy_none(optional_fa);
    }

    #[test]
    fun test_fungible_asset_to_apt() acquires AptosCoinCap {
        let signer_address = @0x1;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a coin and convert to fungible asset
        let initial_coin = mint_aptos_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&initial_coin);
        let fungible_asset = fa_converter::coin_to_fungible_asset(initial_coin);

        // Convert back to coin
        let final_coin = fa_converter::fungible_asset_to_coin<AptosCoin>(fungible_asset);

        // Verify the coin has the same value
        assert!(coin::value(&final_coin) == initial_value, 0);

        // Clean up
        burn_aptos_coin_for_test(&test_signer, final_coin);
    }

    #[test]
    fun test_fungible_asset_to_fake_coin() {
        let signer_address = @fa_converter;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a coin and convert to fungible asset
        let initial_coin = mint_fake_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&initial_coin);
        let fungible_asset = fa_converter::coin_to_fungible_asset(initial_coin);

        // Convert back to coin
        let final_coin = fa_converter::fungible_asset_to_coin<FakeCoin>(fungible_asset);

        // Verify the coin has the same value
        assert!(coin::value(&final_coin) == initial_value, 0);

        // Clean up
        deposit_fake_coin_for_test(&test_signer, final_coin);
    }

    #[test]
    fun test_optional_fungible_asset_to_apt_some() acquires AptosCoinCap {
        let signer_address = @0x1;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a coin and convert to optional fungible asset
        let initial_coin = mint_aptos_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&initial_coin);
        let fungible_asset = fa_converter::coin_to_fungible_asset(initial_coin);
        let optional_fa = option::some(fungible_asset);

        // Convert optional fungible asset to coin
        let final_coin = fa_converter::optional_fungible_asset_to_coin<AptosCoin>(optional_fa);

        // Verify the coin has the same value
        assert!(coin::value(&final_coin) == initial_value, 0);

        // Clean up
        burn_aptos_coin_for_test(&test_signer, final_coin);
    }

    #[test]
    fun test_optional_fungible_asset_to_fake_coin_some() {
        let signer_address = @fa_converter;
        let test_signer = account::create_account_for_test(signer_address);

        // Create a coin and convert to optional fungible asset
        let initial_coin = mint_fake_coin_for_test(&test_signer, 100);
        let initial_value = coin::value(&initial_coin);
        let fungible_asset = fa_converter::coin_to_fungible_asset(initial_coin);
        let optional_fa = option::some(fungible_asset);

        // Convert optional fungible asset to coin
        let final_coin = fa_converter::optional_fungible_asset_to_coin<FakeCoin>(optional_fa);

        // Verify the coin has the same value
        assert!(coin::value(&final_coin) == initial_value, 0);

        // Clean up
        deposit_fake_coin_for_test(&test_signer, final_coin);
    }

    #[test]
    fun test_optional_fungible_asset_to_apt_none() {
        // Create optional fungible asset with None
        let optional_fa = option::none<FungibleAsset>();

        // Convert optional fungible asset to coin
        let coin = fa_converter::optional_fungible_asset_to_coin<AptosCoin>(optional_fa);

        // Verify we got a zero coin
        assert!(coin::value(&coin) == 0, 0);

        // Clean up
        coin::destroy_zero(coin);
    }

    #[test]
    fun test_optional_fungible_asset_to_fake_coin_none() {
        // Create optional fungible asset with None
        let optional_fa = option::none<FungibleAsset>();

        // Convert optional fungible asset to coin
        let coin = fa_converter::optional_fungible_asset_to_coin<FakeCoin>(optional_fa);

        // Verify we got a zero coin
        assert!(coin::value(&coin) == 0, 0);

        // Clean up
        coin::destroy_zero(coin);
    }
} 