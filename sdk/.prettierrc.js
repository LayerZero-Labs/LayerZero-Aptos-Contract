module.exports = {
    overrides: [
        {
            files: "*.move",
            options: {
                bracketSpacing: false,
                printWidth: 300,
                tabWidth: 4,
                useTabs: false,
                singleQuote: false,
                explicitTypes: "never",
            },
        },
        {
            files: ["*.ts", "*.mts"],
            options: {
                printWidth: 120,
                semi: false,
                tabWidth: 4,
                useTabs: false,
                singleQuote: true,
                trailingComma: "es5",
            },
        },
        {
            files: "*.js",
            options: {
                printWidth: 120,
                semi: false,
                tabWidth: 4,
                useTabs: false,
                trailingComma: "es5",
            },
        },
    ],
}
