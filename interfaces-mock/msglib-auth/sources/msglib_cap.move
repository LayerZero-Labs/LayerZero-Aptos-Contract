// Mock msglib_auth
module msglib_auth::msglib_cap {
    use layerzero_common::semver::{Self, SemVer};

    #[test_only]
    use layerzero_common::semver::build_version;

    struct MsgLibSendCapability has store {
        version: SemVer,
    }

    struct MsgLibReceiveCapability has store {
        version: SemVer,
    }

    public fun assert_send_version(cap: &MsgLibSendCapability, major: u64, minor: u8) {
        let (cap_major, cap_minor) = semver::values(&cap.version);
        assert!(cap_major == major && cap_minor == minor, 0);
    }

    public fun assert_receive_version(cap: &MsgLibReceiveCapability, major: u64, minor: u8) {
        let (cap_major, cap_minor) = semver::values(&cap.version);
        assert!(cap_major == major && cap_minor == minor, 0);
    }

    #[test_only]
    public fun receive_cap(major: u64, minor: u8): MsgLibReceiveCapability {
        MsgLibReceiveCapability {
            version: build_version(major, minor),
        }
    }

    #[test_only]
    public fun send_cap(major: u64, minor: u8): MsgLibSendCapability {
        MsgLibSendCapability {
            version: build_version(major, minor),
        }
    }
}