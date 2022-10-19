module layerzero_common::semver {
    use layerzero_common::utils::assert_u16;

    // reserved msg lib versions
    const DEFAULT_VERSION: u64 = 0;
    const BLOCK_VERSION: u64 = 65535;

    // a semantic version representation
    // major version starts from 1 and minor version starts from 0
    struct SemVer has drop, store, copy {
        major: u64,
        minor: u8,
    }

    public fun next_major(v: &SemVer): SemVer {
        build_version(v.major + 1, 0)
    }

    public fun next_minor(v: &SemVer): SemVer {
        build_version(v.major, v.minor + 1)
    }

    public fun major(v: &SemVer): u64 {
        v.major
    }

    public fun minor(v: &SemVer): u8 {
        v.minor
    }

    public fun values(v: &SemVer): (u64, u8) {
        (v.major, v.minor)
    }

    public fun build_version(major: u64, minor: u8): SemVer {
        assert_u16(major);
        SemVer {
            major,
            minor,
        }
    }

    public fun default_version(): SemVer {
        SemVer {
            major: DEFAULT_VERSION,
            minor: 0,
        }
    }

    public fun blocking_version(): SemVer {
        SemVer {
            major: BLOCK_VERSION,
            minor: 0,
        }
    }

    public fun is_blocking(v: &SemVer): bool {
        v.major == BLOCK_VERSION
    }

    public fun is_default(v: &SemVer): bool {
        v.major == DEFAULT_VERSION
    }

    public fun is_blocking_or_default(v: &SemVer): bool {
        v.major == BLOCK_VERSION || v.major == DEFAULT_VERSION
    }
}