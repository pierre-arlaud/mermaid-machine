import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['build/**', 'node_modules/**']
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            'indent': ['error', 4, { SwitchCase: 1 }]
        }
    }
);
