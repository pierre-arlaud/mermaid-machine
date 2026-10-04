import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/tests/**/*.spec.ts'],
        setupFiles: ['src/tests/setup.ts'],
        // Run every spec file in one shared module registry, so expensive one-time setup (jsdom, mermaid) is paid once per run instead of once per file.
        isolate: false,
        fileParallelism: false
    }
});
