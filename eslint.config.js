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
            '@typescript-eslint/member-ordering': 'error'
        }
    }
);
