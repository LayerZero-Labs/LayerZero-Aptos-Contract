#[test_only]
module layerzero::test_helpers {
    use layerzero::uln_receive;
    use layerzero::msglib_v1_0;
    use layerzero::uln_config;
    use layerzero::uln_signer;
    use layerzero::channel;
    use layerzero::msglib_config;
    use layerzero_common::packet::{Self, Packet};
    use std::signer::address_of;
    use layerzero::endpoint;
    use layerzero::executor_config;
    use layerzero::executor_v1::{Self, Executor};
    use layerzero::packet_event;
    use layerzero::bulletin;
    use layerzero::admin;
    use aptos_framework::aptos_account;
    use msglib_auth::msglib_cap;
    use executor_auth::executor_cap;

    // setup layerzero with 1% treasury fee
    // setup a relayer with 100 base fee and 1 fee per bytes
    // setup an oracle with 10 base fee and 0 fee per bytes
    // setup default app config with above relayer and oracle and 15 block confirmations
    // setup a default executor config with 0 gas price
    public fun setup_layerzero_for_test(
        lz: &signer,
        msglib_auth: &signer,
        oracle_root: &signer,
        relayer_root: &signer,
        executor_root: &signer,
        executor_auth: &signer,
        src_chain_id: u64,
        dst_chain_id: u64,
    ) {
        // init modules first as if we deployed
        channel::init_module_for_test(lz);

        msglib_config::init_module_for_test(lz);

        // msgliv v1
        admin::init_module_for_test(lz);
        uln_config::init_module_for_test(lz);
        msglib_v1_0::init_module_for_test(lz);
        packet_event::init_module_for_test(lz);
        executor_v1::init_module_for_test(lz);

        // init endpoint
        bulletin::init_module_for_test(lz);

        // msg auth
        msglib_cap::init_module_for_test(msglib_auth);
        msglib_cap::allow(msglib_auth, @layerzero);
        // executor
        executor_config::init_module_for_test(lz);
        executor_cap::init_module_for_test(executor_auth);

        endpoint::init(lz, src_chain_id);
        uln_receive::init(lz);
        msglib_config::set_default_send_msglib(lz, dst_chain_id, 1, 0);
        msglib_config::set_default_receive_msglib(lz, dst_chain_id, 1, 0);

        endpoint::register_executor<Executor>(executor_auth);
        executor_config::set_default_executor(lz, dst_chain_id, 1, address_of(executor_root));
        executor_v1::set_default_adapter_params(lz, dst_chain_id, vector<u8>[0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
        executor_v1::register(executor_root);
        executor_v1::set_fee(executor_root, dst_chain_id, 100000, 0, 0);

        uln_config::set_chain_address_size(lz, dst_chain_id,32);
        msglib_v1_0::set_treasury_fee(lz, 100); // 1%
        // register offchain workers
        uln_signer::register(oracle_root);
        uln_signer::register(relayer_root);
        uln_signer::set_fee(oracle_root, dst_chain_id, 10, 0);
        uln_signer::set_fee(relayer_root, dst_chain_id, 100, 1);

        let oracle_addr = address_of(oracle_root);
        let relayer_addr = address_of(relayer_root);
        uln_config::set_default_config(lz, dst_chain_id, oracle_addr, relayer_addr, 15, 15);
    }

    public fun deliver_packet<UA>(oracle_root: &signer, relayer_root: &signer, emitted_packet: Packet, confirmation: u64) {
        let hash = packet::hash_sha3_packet(&emitted_packet);
        uln_receive::oracle_propose(oracle_root, hash, confirmation);
        uln_receive::relayer_verify<UA>(
            relayer_root,
            packet::encode_packet(&emitted_packet),
            confirmation,
        );
    }

    public fun setup_layerzero_for_oracle_test(
        lz: &signer,
        msglib_auth: &signer,
    ) {
        aptos_account::create_account(address_of(lz));

        // init modules first as if we deployed
        msglib_config::init_module_for_test(lz);
        bulletin::init_module_for_test(lz);
        // msgliv v1
        uln_config::init_module_for_test(lz);
        msglib_v1_0::init_module_for_test(lz);

        msglib_cap::init_module_for_test(msglib_auth);
        msglib_cap::allow(msglib_auth, @layerzero);

        // init endpoint
        endpoint::init(lz, 108);

        // init and register msglib
        uln_receive::init(lz);
    }
}