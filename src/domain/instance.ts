import type { RunContext } from './context.js';
import type { TransitionSelector } from './state.js';
import type { Workflow } from './workflow.js';
import type { HistoryEntry, Token } from './workflow-engine.js';
import { WorkflowEngine, InstanceFailureError } from './workflow-engine.js';

export type { HistoryEntry, Token };
export { InstanceFailureError };

const DEFAULT_RETRY_LIMIT = 5;

export interface InstanceOptions {
    /** Max total onRun invocations per state (including the first) before throwing. Default 5. */
    defaultRetryLimit?: number;
}

/**
 * A live execution of a Workflow: identity + public API. All token bookkeeping, state-running,
 * and transition-crossing logic lives in WorkflowEngine, which Instance delegates to exclusively.
 */
export class Instance<Document> implements RunContext<Document> {

    readonly document: Document;
    readonly workflow: Workflow<Document>;
    readonly defaultRetryLimit: number;

    private readonly _engine: WorkflowEngine<Document>;

    constructor(workflow: Workflow<Document>, document: Document, options?: InstanceOptions) {
        this.workflow = workflow;
        this.document = document;
        this.defaultRetryLimit = options?.defaultRetryLimit ?? DEFAULT_RETRY_LIMIT;
        this._engine = new WorkflowEngine<Document>(this, workflow, this.defaultRetryLimit);
    }

    get history(): readonly HistoryEntry[] {
        return this._engine.history;
    }

    /** No tokens left anywhere: every branch reached a true sink state. */
    get isComplete(): boolean {
        return this._engine.isComplete;
    }

    activeTokens(): Readonly<Token>[] {
        return this._engine.activeTokens();
    }

    activeStateIds(): string[] {
        return [...new Set(this.activeTokens().map(token => token.stateId))];
    }

    isActive(stateId: string): boolean {
        return this.activeStateIds().includes(stateId);
    }

    /**
     * Begins this instance's execution at the given state, or at the workflow's sole declared
     * start state if omitted. An explicit stateId must itself be a declared start state; use
     * `triggerState` to begin execution elsewhere. Must be called exactly once.
     * @throws {InstanceFailureError} If any token in the initial cascade failed.
     */
    async start(stateId?: string): Promise<void> {
        await this._engine.start(stateId);
    }

    /**
     * Runs a fresh cascade for this event state.
     * @throws {InstanceFailureError} If any token in that cascade failed.
     */
    async triggerState(stateId: string): Promise<void> {
        await this._engine.triggerState(stateId);
    }

    /**
     * Resolves the oldest token waiting at this state (FIFO) and runs it.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualTokenAt(stateId: string, selector: TransitionSelector = {}): Promise<void> {
        await this._engine.advanceManualTokenAt(stateId, selector);
    }

    /**
     * Runs a specific waiting token.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualToken(tokenId: number, selector: TransitionSelector = {}): Promise<void> {
        await this._engine.advanceManualToken(tokenId, selector);
    }

}
