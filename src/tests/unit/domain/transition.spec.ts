import { Transition } from '../../../domain/transition.js';

interface TestDoc {
    value?: number;
}

describe('Transition', () => {

    it('invokes the registered `onCheckBefore` predicate with the given context', async () => {
        const transition = new Transition<TestDoc>({ from: 'A', to: 'B' });
        const context = { document: { value: 1 } };
        const predicate = vi.fn().mockReturnValue(true);
        transition.onCheckBefore(predicate);

        expect(await transition.checkBefore(context)).toBe(true);
        expect(predicate).toHaveBeenCalledWith(context);
    });

    it('defaults to eligible when no `onCheckBefore` is registered', async () => {
        const transition = new Transition<TestDoc>({ from: 'A', to: 'B' });

        expect(await transition.checkBefore({ document: {} })).toBe(true);
    });

});
