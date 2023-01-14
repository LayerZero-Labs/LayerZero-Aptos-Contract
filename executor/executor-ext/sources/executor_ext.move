module executor_ext::executor_ext {
    use aptos_std::type_info;
    use std::signer;

    struct TypeArguments has key {
        types: vector<type_info::TypeInfo>
    }

    public fun build_lz_receive_types(account: &signer, types: vector<type_info::TypeInfo>) acquires TypeArguments {
        if (exists<TypeArguments>(signer::address_of(account))) {
            let arguments = move_from<TypeArguments>(signer::address_of(account));
            let TypeArguments { types: _ } = arguments;
        };

        move_to(account, TypeArguments { types });
    }

    #[test_only]
    struct ExampleType {}

    #[test_only]
    struct ExampleType2 {}

    #[test(account = @0xDEAD)]
    fun test_lz_receive_types(account: &signer) acquires TypeArguments{
        let type_args = vector<type_info::TypeInfo>[type_info::type_of<ExampleType>(), type_info::type_of<ExampleType2>()];
        build_lz_receive_types(account, type_args);
        let args = borrow_global<TypeArguments>(signer::address_of(account));
        assert!(type_args == args.types, 2);

        let type_args = vector<type_info::TypeInfo>[type_info::type_of<ExampleType>()];
        build_lz_receive_types(account, type_args);
        let args = borrow_global<TypeArguments>(signer::address_of(account));
        assert!(type_args == args.types, 3)
    }
}

