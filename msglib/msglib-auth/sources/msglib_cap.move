// manages the creation of authentication capabilities for msglib
// 1/ msglib_auth root account allows() a new msglib account to create caps (one-time only)
// 2/ the newly allowed msglib account calls register_msglib() at the endpoint, which then forwards the signer to
//      here new_version() to retrive the capaibility.
//      (a) The send_cap will be stored at the endpoint and
//      (b) the receive_cap will be stored at the msglib_receive side for authentication.
//    the new version could be either a new MAJOR or MINOR version
module msglib_auth::msglib_cap {
    use std::signer::address_of;
    use std::error;
    use layerzero_common::semver::{Self, SemVer};
    use std::acl::{Self, ACL};
    use layerzero_common::utils::{assert_signer, assert_type_signer};

    const EMSGLIB_VERSION_NOT_SUPPORTED: u64 = 0x00;

    struct GlobalStore has key {
        last_version: SemVer,
        msglib_acl: ACL,
    }

    struct MsgLibSendCapability has store {
        version: SemVer,
    }

    struct MsgLibReceiveCapability has store {
        version: SemVer,
    }

    fun init_module(account: &signer) {
        move_to(account, GlobalStore {
            last_version: semver::build_version(0, 0),
            msglib_acl: acl::empty(),
        })
    }

    public fun new_version<MGSLIB>(account: &signer, major: bool): (SemVer, MsgLibSendCapability, MsgLibReceiveCapability) acquires GlobalStore {
        assert_type_signer<MGSLIB>(account);

        let store = borrow_global_mut<GlobalStore>(@msglib_auth);
        acl::assert_contains(&store.msglib_acl, address_of(account));
        // remove from ACl after registration
        acl::remove(&mut store.msglib_acl, address_of(account));

        let version = if (major) {
            semver::next_major(&store.last_version)
        } else {
            semver::next_minor(&store.last_version)
        };
        store.last_version = version;
        (version, MsgLibSendCapability { version }, MsgLibReceiveCapability { version })
    }

    public entry fun allow(account: &signer, msglib_receive: address) acquires GlobalStore {
        assert_signer(account, @msglib_auth);

        let store = borrow_global_mut<GlobalStore>(@msglib_auth);
        acl::add(&mut store.msglib_acl, msglib_receive);
    }

    public entry fun disallow(account: &signer, msglib_receive: address) acquires GlobalStore {
        assert_signer(account, @msglib_auth);

        let store = borrow_global_mut<GlobalStore>(@msglib_auth);
        acl::remove(&mut store.msglib_acl, msglib_receive);
    }

    public fun send_version(cap: &MsgLibSendCapability): SemVer {
        cap.version
    }

    public fun receive_version(cap: &MsgLibReceiveCapability): SemVer {
        cap.version
    }

    public fun assert_send_version(cap: &MsgLibSendCapability, major: u64, minor: u8) {
        let (cap_major, cap_minor) = semver::values(&cap.version);
        assert!(cap_major == major && cap_minor == minor, error::invalid_argument(EMSGLIB_VERSION_NOT_SUPPORTED));
    }

    public fun assert_receive_version(cap: &MsgLibReceiveCapability, major: u64, minor: u8) {
        let (cap_major, cap_minor) = semver::values(&cap.version);
        assert!(cap_major == major && cap_minor == minor, error::invalid_argument(EMSGLIB_VERSION_NOT_SUPPORTED));
    }

    #[test_only]
    public fun init_module_for_test(account: &signer) {
        init_module(account);
    }
}