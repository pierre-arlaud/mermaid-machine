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
            const handler = vi.fn();
            state.onRun(handler);

            await state.run(context);

            expect(handler).toHaveBeenCalledWith(context);
        });

        it('is a no-op when no onRun handler is registered', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            await expect(state.run({ document: {} })).resolves.toBeUndefined();
        });

    });

    describe('checking the result', () => {

        it('defaults to eligible when no `onCheckResult` is registered', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(state.hasCheckResult()).toBe(false);
            expect(await state.checkResult({ document: {} })).toBe(true);
        });

        it('reports it has a check result handler once it’s been registered', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            state.onCheckResult(() => true);

            expect(state.hasCheckResult()).toBe(true);
        });

        it('invokes the registered `onCheckResult` with the given context', async () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            const context = { document: { value: 1 } };
            const predicate = vi.fn().mockReturnValue(true);
            state.onCheckResult(predicate);

            expect(await state.checkResult(context)).toBe(true);
            expect(predicate).toHaveBeenCalledWith(context);
        });

    });

    describe('setting a retry limit', () => {

        it('has no retry limit when it’s not been overriden', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);

            expect(state.retryLimit).toBeUndefined();
        });

        it('reflects the override passed to `onCheckResult`', () => {
            const state = new State<TestDoc>({ id: 'A', type: 'auto' }, []);
            state.onCheckResult(() => true, { retries: 2 });

            expect(state.retryLimit).toBe(2);
        });

    });

});
