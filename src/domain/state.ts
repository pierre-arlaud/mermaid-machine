import { ChartState, ChartTransition, StateType } from './chart.js';
import { CheckContext, CheckHandler, RunContext, RunHandler } from './context.js';
import { Transition } from './transition.js';
import { assertTimeout } from '../utils/timeout.js';

export interface TransitionSelector {
    to?: string;
    label?: string;
}

export interface RunOptions {
    /** Overrides the instance's default timeout for this state's `onRun`, in milliseconds; 0 disables it. */
    timeout?: number;
    /** Overrides the instance's default retry limit for this state only. */
    retries?: number;
}

export interface CheckOptions {
    /** Overrides the instance's default timeout for this handler, in milliseconds; 0 disables it. */
    timeout?: number;
}

export class State<Document> {

    readonly id: string;
    readonly type: StateType;
    readonly label?: string;

    private readonly _transitions: Transition<Document>[];

    private _onCheckBefore?: CheckHandler<Document>;
    private _onRun?: RunHandler<Document>;
    private _onCheckResult?: CheckHandler<Document>;
    private _retryLimit?: number;
    private _checkBeforeTimeout?: number;
    private _runTimeout?: number;
    private _checkResultTimeout?: number;
    private _frozen = false;

    constructor(chartState: ChartState, outgoing: ChartTransition[]) {
        this.id = chartState.id;
        this.type = chartState.type;
        this.label = chartState.label;
        this._transitions = outgoing.map(t => new Transition<Document>(t));
    }

    /**
     * This state's own retry limit set via `onRun` options, or undefined to fall back to the instance's default.
     * @internal Read by WorkflowEngine only.
     */
    get retryLimit(): number | undefined {
        return this._retryLimit;
    }

    /**
     * This state's own `onCheckBefore` timeout in milliseconds, or undefined to fall back to the instance's default.
     * @internal Read by WorkflowEngine only.
     */
    get checkBeforeTimeout(): number | undefined {
        return this._checkBeforeTimeout;
    }

    /**
     * This state's own `onRun` timeout in milliseconds, or undefined to fall back to the instance's default.
     * @internal Read by WorkflowEngine only.
     */
    get runTimeout(): number | undefined {
        return this._runTimeout;
    }

    /**
     * This state's own `onCheckResult` timeout in milliseconds, or undefined to fall back to the instance's default.
     * @internal Read by WorkflowEngine only.
     */
    get checkResultTimeout(): number | undefined {
        return this._checkResultTimeout;
    }

    findTransition(selector: TransitionSelector = {}): Transition<Document> {
        const matches = this.findTransitions(selector);
        if (matches.length !== 1) {
            throw new Error(
                `State "${ this.id }" has ${ matches.length } transitions matching ${ JSON.stringify(selector) }, ` +
                'expected exactly 1.'
            );
        }
        return matches[0];
    }

    findTransitions(selector: TransitionSelector = {}): Transition<Document>[] {
        return this._transitions.filter(t =>
            (selector.to === undefined || t.to === selector.to) &&
            (selector.label === undefined || t.label === selector.label)
        );
    }

    /**
     * Sets the check deciding whether a token may enter this state, and optionally its own timeout.
     * A check exceeding its timeout counts as throwing, not as returning false, and is not retried.
     * @returns This state, for chaining.
     * @throws {Error} If the workflow has been frozen by its first `instantiate()`.
     * @throws {RangeError} If the timeout is negative, NaN, or above what timers support (overflow).
     */
    onCheckBefore(check: CheckHandler<Document>, options?: CheckOptions): this {
        this.assertNotFrozen();
        if (options?.timeout !== undefined) assertTimeout(options.timeout, `State "${ this.id }" onCheckBefore timeout`);
        this._onCheckBefore = check;
        if (options?.timeout !== undefined) {
            this._checkBeforeTimeout = options.timeout;
        }
        return this;
    }

    /**
     * Sets the handler run when a token enters this state, and optionally this state's own timeout and retry limit.
     * Every state runs it on arrival: a manual state then holds the token, while the other state types move it on.
     * This can fail when the handler or `onCheckResult` throws or times out, or when `onCheckResult` returns false.
     * In those cases, the handler is retried up to the retry limit.
     * On timeout, the engine stops waiting and aborts the given signal.
     * A handler ignoring the signal keeps running in the background, possibly alongside the next attempt.
     * @returns This state, for chaining.
     * @throws {Error} If the workflow has been frozen by its first `instantiate()`.
     * @throws {RangeError} If the timeout is negative, NaN, or above what timers support (overflow).
     * @throws {RangeError} If retries is not a positive integer.
     */
    onRun(handler: RunHandler<Document>, options?: RunOptions): this {
        this.assertNotFrozen();
        if (options?.timeout !== undefined) assertTimeout(options.timeout, `State "${ this.id }" onRun timeout`);
        if (options?.retries !== undefined && (!Number.isInteger(options.retries) || options.retries < 1)) {
            throw new RangeError(`State "${ this.id }" onRun retries must be a positive integer; got ${ options.retries }.`);
        }
        this._onRun = handler;
        if (options?.timeout !== undefined) {
            this._runTimeout = options.timeout;
        }
        if (options?.retries !== undefined) {
            this._retryLimit = options.retries;
        }
        return this;
    }

    /**
     * Sets the check deciding whether the `onRun` handler succeeded, and optionally its own timeout.
     * Like the handler's, the check's failures count as failed attempts, see `onRun`.
     * @returns This state, for chaining.
     * @throws {Error} If the workflow has been frozen by its first `instantiate()`.
     * @throws {RangeError} If the timeout is negative, NaN, or above what timers support (overflow).
     */
    onCheckResult(check: CheckHandler<Document>, options?: CheckOptions): this {
        this.assertNotFrozen();
        if (options?.timeout !== undefined) assertTimeout(options.timeout, `State "${ this.id }" onCheckResult timeout`);
        this._onCheckResult = check;
        if (options?.timeout !== undefined) {
            this._checkResultTimeout = options.timeout;
        }
        return this;
    }

    /**
     * Tells whether a token may enter this state.
     * @returns Whether a token may enter this state, i.e. the result of `onCheckBefore`, or true when none is set.
     * @internal Called by WorkflowEngine only.
     */
    async checkBefore(context: CheckContext<Document>, signal: AbortSignal): Promise<boolean> {
        return this._onCheckBefore ? await this._onCheckBefore(context, signal) : true;
    }

    /**
     * Runs the `onRun` handler, if any.
     * @internal Called by WorkflowEngine only.
     */
    async run(context: RunContext<Document>, signal: AbortSignal): Promise<void> {
        if (this._onRun) {
            await this._onRun(context, signal);
        }
    }

    /**
     * Tells whether the `onRun` handler succeeded.
     * @returns Whether the `onRun` handler succeeded, i.e. the result of `onCheckResult`, or true when none is set.
     * @internal Called by WorkflowEngine only.
     */
    async checkResult(context: CheckContext<Document>, signal: AbortSignal): Promise<boolean> {
        return this._onCheckResult ? await this._onCheckResult(context, signal) : true;
    }

    /**
     * Tells whether an `onCheckResult` check is set.
     * @returns Whether an `onCheckResult` check is set.
     * @internal Called by WorkflowEngine only.
     */
    hasCheckResult(): boolean {
        return this._onCheckResult !== undefined;
    }

    /**
     * Makes this state's handlers, and those of its outgoing transitions, immutable.
     * @internal Called by Workflow only.
     */
    freeze(): void {
        this._frozen = true;
        for (const transition of this._transitions) {
            transition.freeze();
        }
    }

    private assertNotFrozen(): void {
        if (this._frozen) throw new Error(`State "${ this.id }" is frozen: its workflow has been instantiated.`);
    }

}
