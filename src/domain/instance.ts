import type { RunContext } from './context.js';
import type { TransitionSelector } from './state.js';
import type { Workflow } from './workflow.js';
import type { HistoryEntry, Token } from './workflow-engine.js';
import { WorkflowEngine, InstanceFailureError } from './workflow-engine.js';
import { assertTimeout } from '../utils/timeout.js';

export type { HistoryEntry, Token };
export { InstanceFailureError };

const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_CASCADE_VISIT_LIMIT = 1000;
const DEFAULT_HANDLER_TIMEOUT = 30_000;

export interface InstanceOptions {
    /**
     * Max total `onRun` invocations per state (including the first) before throwing.
     * @defaultValue 5
     */
    defaultRetryLimit?: number;
    /**
     * Max times a single state may be entered within one cascade, i.e. without stopping at a manual state or a gate.
     * The token entering it once more fails instead, as the workflow is then assumed to loop forever.
     * @defaultValue 1000
     */
    cascadeVisitLimit?: number;
    /**
     * Max time in milliseconds a handler may take before its attempt fails, unless the handler sets its own timeout; 0 disables it.
     * @defaultValue 30000
     */
    defaultHandlerTimeout?: number;
}

/**
 * A live execution of a Workflow: identity + public API. 
 * All token bookkeeping, state-running, and transition-crossing logic lives in WorkflowEngine, which Instance delegates to exclusively.
 */
export class Instance<Document> implements RunContext<Document> {

    readonly document: Document;
    readonly workflow: Workflow<Document>;
    /** The options this instance runs with, every unset one resolved to its default. */
    readonly options: Readonly<Required<InstanceOptions>>;

    private readonly _engine: WorkflowEngine<Document>;

    constructor(workflow: Workflow<Document>, document: Document, options?: InstanceOptions) {
        this.workflow = workflow;
        this.document = document;

        // Options are resolved one by one rather than spread over the defaults.
        // That way, an option passed as undefined still gets its default.
        this.options = {
            defaultRetryLimit: options?.defaultRetryLimit ?? DEFAULT_RETRY_LIMIT,
            cascadeVisitLimit: options?.cascadeVisitLimit ?? DEFAULT_CASCADE_VISIT_LIMIT,
            defaultHandlerTimeout: options?.defaultHandlerTimeout ?? DEFAULT_HANDLER_TIMEOUT
        };
        assertTimeout(this.options.defaultHandlerTimeout, 'defaultHandlerTimeout');
        for (const name of ['defaultRetryLimit', 'cascadeVisitLimit'] as const) {
            const value = this.options[name];
            if (!Number.isInteger(value) || value < 1) throw new RangeError(`${ name } must be a positive integer; got ${ value }.`);
        }
        this._engine = new WorkflowEngine<Document>(this, workflow, this.options);
    }

    get history(): readonly HistoryEntry[] {
        return this._engine.history;
    }

    /** Whether this instance has completed, i.e. no tokens are left anywhere and every branch reached a true sink state. */
    get isCompleted(): boolean {
        return this._engine.isCompleted;
    }

    /** Whether any token has failed, and so is left at the state where it failed, keeping this instance from completing. */
    get hasFailures(): boolean {
        return this._engine.hasFailures;
    }

    activeTokens(): Readonly<Token>[] {
        return this._engine.activeTokens();
    }

    /**
     * Lists the tokens currently at the given state.
     * @returns The tokens at the given state, whatever their status, or an empty array if there are none or the state does not exist.
     */
    activeTokensAt(stateId: string): Readonly<Token>[] {
        return this.activeTokens().filter(token => token.stateId === stateId);
    }

    activeStateIds(): string[] {
        return [...new Set(this.activeTokens().map(token => token.stateId))];
    }

    isActive(stateId: string): boolean {
        return this.activeStateIds().includes(stateId);
    }

    /**
     * Begins this instance's execution at the given state, or at the workflow's sole declared start state if omitted.
     * An explicit stateId must itself be a declared start state; event states are activated with `triggerState()` instead.
     * Must be called exactly once.
     * @throws {Error} If this instance has already started.
     * @throws {Error} If the given state does not exist or is not a declared start state.
     * @throws {Error} If no state is given and the workflow does not have exactly one start state.
     * @throws {InstanceFailureError} If any token in the initial cascade failed.
     */
    async start(stateId?: string): Promise<void> {
        await this._engine.start(stateId);
    }

    /**
     * Runs a fresh cascade for this event state.
     * Only allowed while this instance is in progress, i.e. after `start()` and before it completes.
     * Use `reopenWithTrigger()` on a completed instance.
     * @throws {Error} If the state does not exist or is not an event state, or if this instance has not started or has completed.
     * @throws {InstanceFailureError} If any token in that cascade failed.
     */
    async triggerState(stateId: string): Promise<void> {
        await this._engine.triggerState(stateId);
    }

    /**
     * Reopens this completed instance by running a fresh cascade for this event state.
     * @throws {Error} If the state does not exist or is not an event state, or if this instance has not started or is still in progress.
     * @throws {InstanceFailureError} If any token in that cascade failed.
     */
    async reopenWithTrigger(stateId: string): Promise<void> {
        await this._engine.reopenWithTrigger(stateId);
    }

    /**
     * Advances the oldest token waiting at this state (FIFO) through the selected transition.
     * The `onRun` handler was already invoked when the token arrived.
     * A call rejected with an `Error` leaves the token waiting.
     * @throws {Error} If the state does not exist, is not a manual state or has no waiting token.
     * @throws {Error} If the selector does not match exactly one transition.
     * @throws {Error} If that transition or its target state is not eligible, or one of their checks throws or times out.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualStateTokenAt(stateId: string, selector: TransitionSelector = {}): Promise<void> {
        await this._engine.advanceManualStateTokenAt(stateId, selector);
    }

    /**
     * Advances a specific waiting token through the selected transition.
     * The `onRun` handler was already invoked when the token arrived.
     * A call rejected with an `Error` leaves the token waiting.
     * @throws {Error} If the token is not waiting.
     * @throws {Error} If the selector does not match exactly one transition.
     * @throws {Error} If that transition or its target state is not eligible, or one of their checks throws or times out.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualStateToken(tokenId: number, selector: TransitionSelector = {}): Promise<void> {
        await this._engine.advanceManualStateToken(tokenId, selector);
    }

}
