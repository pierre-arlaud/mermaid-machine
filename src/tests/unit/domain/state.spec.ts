import { State } from '../../../domain/state.js';

interface TestDoc {
    value?: number;
}

describe('State', () => {

    describe('finding all matching transitions', () => {

        it('returns the sole outgoing transition', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'start' }, [{ from: 'A', to: 'B' }]);

            expect(state.findTransition().to).toBe('B');
        });

        it('throws when asking for the sole transition if there are zero or multiple matches', () => {
            const withMultiple = new State<TestDoc>({ id: 'A', type: 'start' }, [
                { from: 'A', to: 'B' },
                { from: 'A', to: 'C' }
            ]);
            const withNone = new State<TestDoc>({ id: 'B', type: 'manual' }, []);

            expect(() => withMultiple.findTransition()).toThrow();
            expect(() => withNone.findTransition()).toThrow();
        });

        it('never throws when asking for transitions', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'start' }, []);

            expect(state.findTransitions()).toEqual([]);
            expect(state.findTransitions({ to: 'nope' })).toEqual([]);
        });

        it('narrows down by label', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'gate' }, [
                { from: 'A', to: 'B', label: 'approve' },
                { from: 'A', to: 'B', label: 'reject' }
            ]);

            expect(() => state.findTransition({ to: 'B' })).toThrow();
            expect(state.findTransitions({ to: 'B' })).toHaveLength(2);
            expect(state.findTransition({ label: 'reject' }).to).toBe('B');
            expect(state.findTransition({ to: 'B', label: 'approve' }).label).toBe('approve');
        });

        it('narrows down by target', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'gate' }, [
                { from: 'A', to: 'B', label: 'next' },
                { from: 'A', to: 'C', label: 'next' }
            ]);

            expect(() => state.findTransition({ label: 'next' })).toThrow();
            expect(state.findTransitions({ label: 'next' })).toHaveLength(2);
            expect(state.findTransition({ to: 'B' }).label).toBe('next');
            expect(state.findTransition({ to: 'C', label: 'next' }).to).toBe('C');
        });

    });

    describe('running the state body', () => {

        it('invokes the registered `onRun` handler with the given context', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            const context = { document: { value: 1 } };
            const signal = new AbortController().signal;
            const handler = vi.fn();
            state.onRun(handler);

            await state.run(context, signal);

            expect(handler).toHaveBeenCalledWith(context, signal);
        });

        it('is a no-op when no `onRun` handler is registered', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            await expect(state.run({ document: {} }, new AbortController().signal)).resolves.toBeUndefined();
        });

    });

    describe('checking the result', () => {

        it('defaults to eligible when no `onCheckResult` is registered', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(state.hasCheckResult()).toBe(false);
            expect(await state.checkResult({ document: {} }, new AbortController().signal)).toBe(true);
        });

        it('reports it has a check result handler once it’s been registered', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            state.onCheckResult(() => true);

            expect(state.hasCheckResult()).toBe(true);
        });

        it('invokes the registered `onCheckResult` with the given context', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            const context = { document: { value: 1 } };
            const signal = new AbortController().signal;
            const check = vi.fn().mockReturnValue(true);
            state.onCheckResult(check);

            expect(await state.checkResult(context, signal)).toBe(true);
            expect(check).toHaveBeenCalledWith(context, signal);
        });

    });

    describe('setting a retry limit', () => {

        it('has no retry limit when it’s not been overriden', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(state.retryLimit).toBeUndefined();
        });

        it('reflects the override passed to `onRun`', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            state.onRun(() => {}, { retries: 2 });

            expect(state.retryLimit).toBe(2);
        });

        it.each([0, -1, 1.5, NaN, Infinity])('rejects %s as a retry limit', retries => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(() => state.onRun(() => {}, { retries })).toThrow(RangeError);
            expect(state.retryLimit).toBeUndefined();
        });

    });

    describe('setting a timeout', () => {

        it('rejects an invalid timeout on every handler, without registering the handler', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(() => state.onCheckBefore(() => true, { timeout: -1 })).toThrow(RangeError);
            expect(() => state.onRun(() => {}, { timeout: NaN })).toThrow(RangeError);
            expect(() => state.onCheckResult(() => true, { timeout: 2 ** 31 })).toThrow(RangeError);
            expect(state.hasCheckResult()).toBe(false);
        });

        it('accepts 0 as no timeout', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            state.onRun(() => {}, { timeout: 0 });

            expect(state.runTimeout).toBe(0);
        });

    });

});
