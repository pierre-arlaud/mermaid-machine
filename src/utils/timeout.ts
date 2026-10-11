/**
 * Tells whether a timeout disables timing out altogether.
 * @returns Whether the timeout is 0 or Infinity, both meaning no timeout.
 */
function isUnlimited(timeout: number): boolean {
    return timeout === 0 || timeout === Infinity;
}

/**
 * Checks that a timeout is either a positive number of milliseconds that setTimeout can honor, or 0 or Infinity for no timeout.
 * @throws {RangeError} If the timeout is negative, NaN, or above what timers support (overflow).
 */
export function assertTimeout(timeout: number, name: string): void {
    if (isUnlimited(timeout)) return;
    // setTimeout stores its delay as a signed 32-bit integer, and fires after 1ms for anything above.
    const MAX_TIMEOUT = 2 ** 31 - 1;
    // Written as a positive check so that NaN, failing every comparison, is rejected too.
    if (!(timeout > 0 && timeout <= MAX_TIMEOUT)) {
        throw new RangeError(
            `${ name } must be a positive number of milliseconds up to ${ MAX_TIMEOUT }, or 0 for no timeout; got ${ timeout }.`
        );
    }
}

/**
 * Calls a function, giving up on it once the timeout has passed.
 * On timeout, aborts the signal given to the function and rejects without waiting for it.
 * A timeout of 0 or Infinity never expires.
 * @returns The function's result.
 * @throws {Error} If the function throws, or if the timeout passes first.
 */
export async function withTimeout<T>(name: string, timeout: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    if (isUnlimited(timeout)) return call(controller.signal);

    const pending = call(controller.signal);
    // Once timed out, nothing awaits the abandoned call anymore, so its late rejection must not go unhandled.
    pending.catch(() => {});

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${ name } timed out after ${ timeout }ms.`);
            controller.abort(error);
            reject(error);
        }, timeout);
    });
    try {
        return await Promise.race([pending, expiry]);
    } finally {
        clearTimeout(timer);
    }
}
