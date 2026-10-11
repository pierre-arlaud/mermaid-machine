import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['build/**', 'node_modules/**']
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            'indent': ['error', 4, { SwitchCase: 1 }],
            'quotes': ['error', 'single'],
            'template-curly-spacing': ['error', 'always'],
            'curly': ['error', 'multi-line'],
            'max-len': ['error', { code: 140, ignoreUrls: true }],
            '@typescript-eslint/member-ordering': 'error',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }]
        }
    }
);
