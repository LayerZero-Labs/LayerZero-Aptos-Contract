module bridge::limiter {
    use aptos_framework::timestamp;
    use std::error;
    use aptos_std::math64::{pow};

    friend bridge::coin_bridge;

    const EBRIDGE_CAP_OVERFLOW: u64 = 0x00;

    struct Limiter<phantom CoinType> has key {
        enabled: bool,
        // time in seconds
        t0_sec: u64,
        window_sec: u64,
        // total outflow
        sum_sd: u64,
        // cap
        cap_sd: u64,
    }

    public(friend) fun register_coin<CoinType>(account: &signer, cap_sd: u64) {
        // only call once upon coin registration
        move_to(account, Limiter<CoinType> {
            enabled: true,
            t0_sec: timestamp::now_seconds(),
            sum_sd: 0,
            cap_sd,
            window_sec: 3600 * 4, // default 4 hours
        })
    }

    public(friend) fun set_limiter<CoinType>(enabled: bool, cap_sd: u64, window_sec: u64) acquires Limiter {
        let twa = borrow_global_mut<Limiter<CoinType>>(@bridge);
        twa.enabled = enabled;
        twa.cap_sd = cap_sd;
        twa.window_sec = window_sec;
    }

    // new window, inherit half of the prior sum
    // a simple way to approximate a sliding window
    public(friend) fun try_insert<CoinType>(amount_sd: u64) acquires Limiter {
        let limiter = borrow_global_mut<Limiter<CoinType>>(@bridge);
        if (!limiter.enabled) return;

        let now = timestamp::now_seconds();
        let count = (now - limiter.t0_sec) / limiter.window_sec;
        if (count > 0) {
            limiter.t0_sec = limiter.t0_sec + limiter.window_sec * count;
            if (count >= 64) {
                limiter.sum_sd = 0;
            } else {
                limiter.sum_sd = limiter.sum_sd / pow(2, count);
            }
        };

        limiter.sum_sd = limiter.sum_sd + amount_sd;
        assert!(limiter.sum_sd <= limiter.cap_sd, error::out_of_range(EBRIDGE_CAP_OVERFLOW));
    }

    #[test_only]
    struct FakeCoin {}

    #[test(aptos_framework = @aptos_framework, bridge = @bridge)]
    fun test_limiter(aptos_framework: &signer, bridge: &signer) acquires Limiter {
        use aptos_framework::aptos_account;
        use std::signer;
        use aptos_framework::timestamp;

        aptos_account::create_account(signer::address_of(bridge));

        // set global time
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let time = 1000;
        timestamp::update_global_time_for_test_secs(time);

        register_coin<FakeCoin>(bridge, 10000);
        try_insert<FakeCoin>(5000);

        // in the same time window
        let time = time + 2 * 3600; // half of the window
        timestamp::update_global_time_for_test_secs(time);
        let twa = borrow_global<Limiter<FakeCoin>>(@bridge);
        assert!(twa.sum_sd == 5000, 0);

        // in the next time window
        let time = time + 2 * 3600; // half of the window
        timestamp::update_global_time_for_test_secs(time); // 4 hours later
        try_insert<FakeCoin>(1000);
        let twa = borrow_global<Limiter<FakeCoin>>(@bridge);
        assert!(twa.sum_sd == 3500, 0); // 2500 + 1000

        // in the next 3 time window
        let time = time + 4 * 3600 * 2;
        timestamp::update_global_time_for_test_secs(time);
        try_insert<FakeCoin>(0);
        let twa = borrow_global<Limiter<FakeCoin>>(@bridge);
        assert!(twa.sum_sd == 3500 / 4, 0);
    }

    #[test(aptos_framework = @aptos_framework, bridge = @bridge)]
    #[expected_failure(abort_code = 0x20000, location = Self)]
    fun test_limiter_overflow(aptos_framework: &signer, bridge: &signer) acquires Limiter {
        use aptos_framework::aptos_account;
        use std::signer;
        use aptos_framework::timestamp;

        aptos_account::create_account(signer::address_of(bridge));

        // set global time
        timestamp::set_time_has_started_for_testing(aptos_framework);
        timestamp::update_global_time_for_test_secs(1000);

        register_coin<FakeCoin>(bridge, 10000);

        try_insert<FakeCoin>(10001);
    }

    #[test(aptos_framework = @aptos_framework, bridge = @bridge)]
    #[expected_failure(abort_code = 0x20000, location = Self)]
    fun test_limiter_overflow2(aptos_framework: &signer, bridge: &signer) acquires Limiter {
        use aptos_framework::aptos_account;
        use std::signer;
        use aptos_framework::timestamp;

        aptos_account::create_account(signer::address_of(bridge));

        // set global time
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let time = 1000;
        timestamp::update_global_time_for_test_secs(time);

        register_coin<FakeCoin>(bridge, 10000);
        try_insert<FakeCoin>(5000);

        // in the next time window
        let time = time + 4 * 3600; // half of the window
        timestamp::update_global_time_for_test_secs(time); // 4 hours later
        try_insert<FakeCoin>(1000);
        let twa = borrow_global<Limiter<FakeCoin>>(@bridge);
        assert!(twa.sum_sd == 3500, 0); // 2500 + 1000

        // overflow
        try_insert<FakeCoin>(7000);
    }
}