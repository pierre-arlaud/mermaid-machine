import { ChartTransition } from './chart.js';
import { CheckContext, CheckHandler } from './context.js';
import type { CheckOptions } from './state.js';
import { assertTimeout } from '../utils/timeout.js';

export class Transition<Document> {

    readonly from: string;
    readonly to: string;
    readonly label?: string;

    private _onCheckBefore?: CheckHandler<Document>;
    private _checkBeforeTimeout?: number;
    private _frozen = false;

    constructor(chartTransition: ChartTransition) {
        this.from = chartTransition.from;
        this.to = chartTransition.to;
        this.label = chartTransition.label;
    }

    /**
     * This transition's own `onCheckBefore` timeout in milliseconds, or undefined to fall back to the instance's default.
     * @internal Read by WorkflowEngine only.
     */
    get checkBeforeTimeout(): number | undefined {
        return this._checkBeforeTimeout;
    }

    /**
     * Sets the check deciding whether this transition may be crossed, and optionally its own timeout.
     * When no check is set, this transition is the fallback for its source state, unless that state is a gate.
     * A fallback is crossed only when no other transition is eligible.
     * A check always returning true is therefore not equivalent to no check.
     * Its transition competes with the other ones instead of acting as the fallback.
     * A check exceeding its timeout counts as throwing, not as returning false, and is not retried.
     * @returns This transition, for chaining.
     * @throws {Error} If the workflow has been frozen by its first `instantiate()`.
     * @throws {RangeError} If the timeout is negative, NaN, or above what timers support (overflow).
     */
    onCheckBefore(check: CheckHandler<Document>, options?: CheckOptions): this {
        this.assertNotFrozen();
        if (options?.timeout !== undefined) {
            assertTimeout(options.timeout, `Transition from "${ this.from }" to "${ this.to }" onCheckBefore timeout`);
        }
        this._onCheckBefore = check;
        if (options?.timeout !== undefined) {
            this._checkBeforeTimeout = options.timeout;
        }
        return this;
    }

    /**
     * Tells whether an `onCheckBefore` check is set.
     * @returns Whether an `onCheckBefore` check is set, i.e. false for a fallback transition.
     * @internal Called by Workflow and WorkflowEngine only.
     */
    hasCheckBefore(): boolean {
        return this._onCheckBefore !== undefined;
    }

    /**
     * Makes this transition's handlers immutable.
     * @internal Called by State only.
     */
    freeze(): void {
        this._frozen = true;
    }

    /**
     * Tells whether this transition may be crossed.
     * @returns Whether this transition may be crossed, i.e. the result of `onCheckBefore`, or true when none is set.
     * @internal Called by WorkflowEngine only.
     */
    async checkBefore(context: CheckContext<Document>, signal: AbortSignal): Promise<boolean> {
        return this._onCheckBefore ? await this._onCheckBefore(context, signal) : true;
    }

    private assertNotFrozen(): void {
        if (this._frozen) {
            throw new Error(`Transition from "${ this.from }" to "${ this.to }" is frozen: its workflow has been instantiated.`);
        }
    }

}
