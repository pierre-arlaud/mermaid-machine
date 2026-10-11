import { Transition } from '../../../domain/transition.js';

interface TestDoc {
    value?: number;
}

describe('Transition', () => {

    it('invokes the registered `onCheckBefore` check with the given context', async () => {
        const transition = new Transition<TestDoc>({ from: 'A', to: 'B' });
        const context = { document: { value: 1 } };
        const signal = new AbortController().signal;
        const check = vi.fn().mockReturnValue(true);
        transition.onCheckBefore(check);

        expect(await transition.checkBefore(context, signal)).toBe(true);
        expect(check).toHaveBeenCalledWith(context, signal);
    });

    it('defaults to eligible when no `onCheckBefore` is registered', async () => {
        const transition = new Transition<TestDoc>({ from: 'A', to: 'B' });

        expect(await transition.checkBefore({ document: {} }, new AbortController().signal)).toBe(true);
    });

});
