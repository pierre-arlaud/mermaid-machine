import { State } from '../../../domain/state.js';

describe('State', () => {

    describe('finding all matching transitions', () => {

        it('returns the sole outgoing transition', () => {
            const state = new State({ id: 'A', type: 'start' }, [{ from: 'A', to: 'B' }]);

            expect(state.findTransition().to).toBe('B');
        });

        it('throws when asking for the sole transition if there are zero or multiple matches', () => {
            const withMultiple = new State({ id: 'A', type: 'start' }, [
                { from: 'A', to: 'B' },
                { from: 'A', to: 'C' }
            ]);
            const withNone = new State({ id: 'B', type: 'manual' }, []);

            expect(() => withMultiple.findTransition()).toThrow();
            expect(() => withNone.findTransition()).toThrow();
        });

        it('never throws when asking for transitions', () => {
            const state = new State({ id: 'A', type: 'start' }, []);

            expect(state.findTransitions()).toEqual([]);
            expect(state.findTransitions({ to: 'nope' })).toEqual([]);
        });

        it('narrows down by label', () => {
            const state = new State({ id: 'A', type: 'gate' }, [
                { from: 'A', to: 'B', label: 'approve' },
                { from: 'A', to: 'B', label: 'reject' }
            ]);

            expect(() => state.findTransition({ to: 'B' })).toThrow();
            expect(state.findTransitions({ to: 'B' })).toHaveLength(2);
            expect(state.findTransition({ label: 'reject' }).to).toBe('B');
            expect(state.findTransition({ to: 'B', label: 'approve' }).label).toBe('approve');
        });

        it('narrows down by target', () => {
            const state = new State({ id: 'A', type: 'gate' }, [
                { from: 'A', to: 'B', label: 'next' },
                { from: 'A', to: 'C', label: 'next' }
            ]);

            expect(() => state.findTransition({ label: 'next' })).toThrow();
            expect(state.findTransitions({ label: 'next' })).toHaveLength(2);
            expect(state.findTransition({ to: 'B' }).label).toBe('next');
            expect(state.findTransition({ to: 'C', label: 'next' }).to).toBe('C');
        });

    });

});
