import { assertTimeout, withTimeout } from '../../../utils/timeout.js';

/**
 * Builds a call settling after the given delay.
 * @returns The call, resolving to 'done'.
 */
function settlingAfter(delay: number): () => Promise<string> {
    return () => new Promise(resolve => setTimeout(() => resolve('done'), delay));
}

describe('timeout', () => {

    describe('validating a timeout', () => {

        it.each([1, 0.5, 30_000, 2 ** 31 - 1, 0, Infinity])('accepts %s', timeout => {
            expect(() => assertTimeout(timeout, 'timeout')).not.toThrow();
        });

        it.each([-1, NaN, 2 ** 31, -Infinity])('rejects %s', timeout => {
            expect(() => assertTimeout(timeout, 'timeout')).toThrow(RangeError);
        });

    });

    describe('calling under a timeout', () => {

        it('returns the result of a call finishing in time', async () => {
            await expect(withTimeout('call', 1_000, settlingAfter(10))).resolves.toBe('done');
        });

        it('rejects and aborts the signal once the timeout passes', async () => {
            let signal: AbortSignal | undefined;
            const call = (given: AbortSignal): Promise<void> => {
                signal = given;
                return new Promise<void>(() => {});
            };

            await expect(withTimeout('call', 10, call)).rejects.toThrow('call timed out after 10ms.');
            expect(signal?.aborted).toBe(true);
        });

        it.each([0, Infinity])('never times out with %s', async timeout => {
            await expect(withTimeout('call', timeout, settlingAfter(30))).resolves.toBe('done');
        });

    });

});
