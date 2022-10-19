/// ACL has both an allow list and a deny list
/// 1) If one address is in the deny list, it is denied
/// 2) If the allow list is empty and not in the deny list, it is allowed
/// 3) If one address is in the allow list and not in the deny list, it is allowed
/// 4) If the allow list is not empty and the address is not in the allow list, it is denied
module layerzero_common::acl {
    use std::vector;
    use std::error;

    const ELAYERZERO_ACCESS_DENIED: u64 = 0;

    struct ACL has store, drop {
        allow_list: vector<address>,
        deny_list: vector<address>,
    }

    public fun empty(): ACL {
        ACL {
            allow_list: vector::empty<address>(),
            deny_list: vector::empty<address>(),
        }
    }

    /// if not in the allow list, add it. Otherwise, remove it.
    public fun allowlist(acl: &mut ACL, addr: address) {
        let (found, index) = vector::index_of(&acl.allow_list, &addr);
        if (found) {
            vector::swap_remove(&mut acl.allow_list, index);
        } else {
            vector::push_back(&mut acl.allow_list, addr);
        };
    }

    /// if not in the deny list, add it. Otherwise, remove it.
    public fun denylist(acl: &mut ACL, addr: address) {
        let (found, index) = vector::index_of(&acl.deny_list, &addr);
        if (found) {
            vector::swap_remove(&mut acl.deny_list, index);
        } else {
            vector::push_back(&mut acl.deny_list, addr);
        };
    }

    public fun allowlist_contains(acl: &ACL, addr: &address): bool {
        vector::contains(&acl.allow_list, addr)
    }

    public fun denylist_contains(acl: &ACL, addr: &address): bool {
        vector::contains(&acl.deny_list, addr)
    }

    public fun is_allowed(acl: &ACL, addr: &address): bool {
        if (vector::contains(&acl.deny_list, addr)) {
            return false
        };

        vector::length(&acl.allow_list) == 0
            || vector::contains(&acl.allow_list, addr)
    }

    public fun assert_allowed(acl: &ACL, addr:& address) {
        assert!(is_allowed(acl, addr), error::permission_denied(ELAYERZERO_ACCESS_DENIED));
    }

    #[test]
    fun test_allowlist() {
        let alice = @1122;
        let bob = @3344;
        let carol = @5566;
        let acl = empty();

        // add alice and bob to the allow list
        allowlist(&mut acl, alice);
        allowlist(&mut acl, bob);
        assert!(allowlist_contains(&acl, &alice), 0);
        assert!(allowlist_contains(&acl, &bob), 0);
        assert!(!allowlist_contains(&acl, &carol), 0);

        // remove alice from the allow list
        allowlist(&mut acl, alice);
        assert!(!allowlist_contains(&acl, &alice), 0);
        assert!(allowlist_contains(&acl, &bob), 0);
        assert!(!allowlist_contains(&acl, &carol), 0);
    }

    #[test]
    fun test_denylist() {
        let alice = @1122;
        let bob = @3344;
        let carol = @5566;
        let acl = empty();

        // add alice and bob to the deny list
        denylist(&mut acl, alice);
        denylist(&mut acl, bob);
        assert!(denylist_contains(&acl, &alice), 0);
        assert!(denylist_contains(&acl, &bob), 0);
        assert!(!denylist_contains(&acl, &carol), 0);

        // remove alice from the deny list
        denylist(&mut acl, alice);
        assert!(!denylist_contains(&acl, &alice), 0);
        assert!(denylist_contains(&acl, &bob), 0);
        assert!(!denylist_contains(&acl, &carol), 0);
    }

    #[test]
    fun test_assert_allowed() {
        let alice = @1122;
        let bob = @3344;
        let carol = @5566;
        let acl = empty();

        // add carol to the deny list, then assert that alice and bob are allowed
        denylist(&mut acl, carol);
        assert_allowed(&acl, &alice);
        assert_allowed(&acl, &bob);
        assert!(!is_allowed(&acl, &carol), 0);

        // add alice to the allow list, then assert that alice is allowed and bob is not
        allowlist(&mut acl, alice);
        assert_allowed(&acl, &alice);
        assert!(!is_allowed(&acl, &bob), 0);

        // add bob to the allow list, then assert that alice and bob are allowed
        allowlist(&mut acl, bob);
        assert_allowed(&acl, &alice);
        assert_allowed(&acl, &bob);

        // add bob to the deny list, then assert that bob is not allowed even though he is in the allow list
        denylist(&mut acl, bob);
        assert_allowed(&acl, &alice);
        assert!(!is_allowed(&acl, &bob), 0);
        assert!(!is_allowed(&acl, &carol), 0);

        // remove all from lists, then assert that all are allowed
        allowlist(&mut acl, alice);
        allowlist(&mut acl, bob);
        denylist(&mut acl, bob);
        denylist(&mut acl, carol);
        assert_allowed(&acl, &alice);
        assert_allowed(&acl, &bob);
        assert_allowed(&acl, &carol);
    }
}