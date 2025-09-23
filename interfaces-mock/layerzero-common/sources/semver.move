// mock semver
module layerzero_common::semver {
    struct SemVer has drop, store, copy {
        major: u64,
        minor: u8,
    }

    public fun build_version(major: u64, minor: u8): SemVer {
        SemVer {
            major,
            minor,
        }
    }

    public fun values(v: &SemVer): (u64, u8) {
        (v.major, v.minor)
    }
}