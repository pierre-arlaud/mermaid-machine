import type { ExecutionContext, ExecutionHandler } from './context.js';
import type { State, TransitionSelector } from './state.js';
import type { Transition } from './transition.js';
import type { Instance } from './instance.js';
import type { Workflow } from './workflow.js';

export interface HistoryEntry {
    readonly tokenId: number;
    readonly stateId: string;
    readonly enteredAt: Date;
    readonly outcome: 'ran' | 'completed' | 'failed';
    readonly error?: unknown;
}

export class InstanceFailureError extends Error {

    readonly errors: unknown[];

    constructor(errors: unknown[]) {
        super(`${ errors.length } token(s) failed during this run.`);
        this.name = 'InstanceFailureError';
        this.errors = errors;
    }

}

export interface Token {
    readonly tokenId: number;
    stateId: string;
    status: 'running' | 'waiting';
    /**
     * A FIFO number to ensure tokens who have waited the longest are chosen first.
     * Set by `holdToken` on arrival at a waiting state, -1 for a token that has never waited.
     */
    waitSequence: number;
}

/** Runs a Workflow's graph for one Instance: owns token/join/settlement state and drives tokens through it. */
export class WorkflowEngine<Document> {

    private readonly _instance: Instance<Document>;
    private readonly _workflow: Workflow<Document>;
    private readonly _defaultRetryLimit: number;

    private readonly _tokens = new Map<number, Token>();
    private _nextSequence = 0;

    private readonly _gateArrivals = new Map<string, Set<Transition<Document>>>();
    private readonly _openedGates = new Set<string>();

    private readonly _history: HistoryEntry[] = [];

    private _initialized = false;

    constructor(instance: Instance<Document>, workflow: Workflow<Document>, defaultRetryLimit: number) {
        this._instance = instance;
        this._workflow = workflow;
        this._defaultRetryLimit = defaultRetryLimit;
    }

    get history(): readonly HistoryEntry[] {
        return this._history;
    }

    get isComplete(): boolean {
        return this._initialized && this._tokens.size === 0;
    }

    activeTokens(): Readonly<Token>[] {
        return [...this._tokens.values()].map(token => ({ ...token }));
    }

    /**
     * Begins execution at the given state, or at the workflow's sole declared start state if
     * omitted. An explicit stateId must itself be a declared start state; use `triggerState` to
     * begin execution elsewhere. Must be called exactly once.
     * @throws {InstanceFailureError} If any token in the initial cascade failed.
     */
    async start(stateId?: string): Promise<void> {
        if (this._initialized) throw new Error('WorkflowEngine already initialized.');
        const initialStateId = stateId ?? this.resolveDefaultStart();
        if (!this._workflow.states[initialStateId]) throw new Error(`Workflow has no state "${ initialStateId }".`);
        if (!this._workflow.startStateIds.includes(initialStateId)) {
            throw new Error(`State "${ initialStateId }" is not a declared start state.`);
        }
        this._initialized = true;

        const token = this.createToken(initialStateId);
        await this.executeCascade(context => this.enterState(token, context));
    }

    /** Creates a new token on the given event state and runs a fresh cascade; repeatable by design. */
    async triggerState(stateId: string): Promise<void> {
        const state = this._workflow.states[stateId];
        if (!state) throw new Error(`Workflow has no state "${ stateId }".`);
        if (state.type !== 'event') throw new Error(`State "${ stateId }" is "${ state.type }", not "event".`);
        await this.executeCascade(context => this.enterState(this.createToken(stateId), context));
    }

    /**
     * Advances the oldest token currently waiting at the given state.
     * Use `advanceManualToken` directly to target a specific token.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualTokenAt(stateId: string, selector: TransitionSelector = {}): Promise<void> {
        await this.advanceManualToken(this.findWaitingTokenAt(stateId).tokenId, selector);
    }

    /**
     * Advances a token.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualToken(tokenId: number, selector: TransitionSelector = {}): Promise<void> {
        // Validate the token can advance and make it run in a synchronous way.
        const token = this._tokens.get(tokenId);
        if (!token || token.status !== 'waiting') throw new Error(`No token ${ tokenId } is currently waiting.`);
        const state = this._workflow.states[token.stateId];
        if (!state) throw new Error(`Workflow has no state "${ token.stateId }".`);
        if (state.type !== 'manual') throw new Error(`State "${ token.stateId }" is "${ state.type }", not "manual".`);
        token.status = 'running';

        // Run the state's body, then hand off to whatever comes next. Failures are scoped to the execution context.
        const doAdvance = async (context: ExecutionContext, next: () => void | Promise<void>): Promise<void> => {
            try {
                await this.runState(token, state);
                await next();
            } catch (error) {
                this.failToken(token, error, context);
            }
        };

        try {
            const outgoing = state.findTransitions();
            if (outgoing.length === 0) {
                // Reached a state with no output: workflow has completed.
                await this.executeCascade(context => doAdvance(context, () => this.completeToken(token)));
            } else {
                // Find a valid transition and cross it
                const transition = state.findTransition(selector);
                if (!await transition.checkBefore(this._instance)) {
                    throw new Error(`Transition from "${ state.id }" to "${ transition.to }" is not eligible.`);
                }
                const target = this._workflow.states[transition.to];
                if (!await target.checkBefore(this._instance)) {
                    throw new Error(`State "${ transition.to }" is not eligible to be entered.`);
                }
                await this.executeCascade(context => doAdvance(context, () => this.crossTransition(token, transition, false, context)));
            }
        } catch (error) {
            // Validation failed before commit: leave the token waiting so the caller can retry.
            // A committed failure already deleted the token via failToken, so this is a no-op then.
            if (this._tokens.has(token.tokenId)) {
                token.status = 'waiting';
            }
            throw error;
        }
    }

    private resolveDefaultStart(): string {
        if (this._workflow.startStateIds.length !== 1) {
            throw new Error(
                `Workflow has ${ this._workflow.startStateIds.length } start state(s) ` +
                `(${ this._workflow.startStateIds.join(', ') || 'none' }); call start() with an explicit stateId.`
            );
        }
        return this._workflow.startStateIds[0];
    }

    private createToken(stateId: string): Token {
        const token: Token = { tokenId: this._nextSequence++, stateId, status: 'waiting', waitSequence: -1 };
        this._tokens.set(token.tokenId, token);
        return token;
    }

    /**
     * Executes a cascade, while scoping potential errors in the execution context.
     * Failures in the execution are also recorded permanently by `failToken` for `history`.
     */
    private async executeCascade(work: ExecutionHandler): Promise<void> {
        const context = { errors: [] };
        await work(context);
        if (context.errors.length > 0) {
            throw new InstanceFailureError(context.errors.slice());
        }
    }

    private findWaitingTokenAt(stateId: string): Token {
        // Verify the state is a waiting state for tokens.
        const state = this._workflow.states[stateId];
        if (!state) throw new Error(`Workflow has no state "${ stateId }".`);
        if (state.type !== 'manual') throw new Error(`State "${ stateId }" is "${ state.type }", not "manual".`);

        // Find the token that’s been waiting the longest on the given state
        const waiting = [...this._tokens.values()]
            .filter(token => token.stateId === stateId && token.status === 'waiting')
            .sort((a, b) => a.waitSequence - b.waitSequence);
        if (waiting.length === 0) throw new Error(`No token is currently waiting at state "${ stateId }".`);
        return waiting[0];
    }

    private async enterState(token: Token, context: ExecutionContext): Promise<void> {
        const state = this._workflow.states[token.stateId];
        if (state.type === 'manual') {
            this.holdToken(token);
            return;
        }
        try {
            token.status = 'running';
            await this.runState(token, state);
            await this.exitState(token, state, context);
        } catch (error) {
            this.failToken(token, error, context);
        }
    }

    private async runState(token: Token, state: State<Document>): Promise<void> {
        const limit = state.retryLimit ?? this._defaultRetryLimit;
        for (let attempts = 1; attempts <= limit; attempts++) {
            await state.run(this._instance);
            if (!state.hasCheckResult() || await state.checkResult(this._instance)) {
                this._history.push({ tokenId: token.tokenId, stateId: state.id, enteredAt: new Date(), outcome: 'ran' });
                return;
            }
        }
        throw new Error(`State "${ state.id }" exhausted its retry limit (${ limit }).`);
    }

    private async exitState(token: Token, state: State<Document>, context: ExecutionContext): Promise<void> {
        const all = state.findTransitions();
        if (all.length === 0) {
            this.completeToken(token);
            return;
        }
        const eligible = await this.computeEligibleTransitions(state);
        if (eligible.length === 0) {
            throw new Error(`Stuck at "${ state.id }": ${ all.length } transition(s) defined, none eligible.`);
        }
        const isFork = eligible.length > 1;
        await Promise.all(eligible.map(transition => this.crossTransition(token, transition, isFork, context)));
    }

    private async computeEligibleTransitions(state: State<Document>): Promise<Transition<Document>[]> {
        const result: Transition<Document>[] = [];
        for (const transition of state.findTransitions()) {
            if (!await transition.checkBefore(this._instance)) {
                continue;
            }
            const target = this._workflow.states[transition.to];
            if (!await target.checkBefore(this._instance)) {
                continue;
            }
            result.push(transition);
        }
        return result;
    }

    private async crossTransition(sourceToken: Token, transition: Transition<Document>, isFork: boolean, context: ExecutionContext): Promise<void> {
        const target = this._workflow.states[transition.to];

        // A single eligible transition into a non-gate target is a plain continuation, not a fork or a join:
        // the token keeps its identity instead of being replaced by a new one.
        if (!isFork && target.type !== 'gate') {
            sourceToken.stateId = target.id;
            await this.enterState(sourceToken, context);
            return;
        }

        this._tokens.delete(sourceToken.tokenId);
        if (target.type === 'gate') {
            const opened = this.tryOpenGate(target.id, transition);
            if (!opened) {
                return;
            }
        }
        const newToken = this.createToken(target.id);
        await this.enterState(newToken, context);
    }

    /**
     * Records this transition's arrival at the given gate.
     * @returns True on the arrival that completes the gate's quorum (the caller should proceed only then), false otherwise, including for a later arrival at an already-opened gate.
     */
    // MUST stay synchronous: JS's run-to-completion makes this check-then-mark atomic across concurrently-progressing fork branches.
    private tryOpenGate(stateId: string, transition: Transition<Document>): boolean {
        if (this._openedGates.has(stateId)) return false;

        const arrived = this._gateArrivals.get(stateId) ?? new Set<Transition<Document>>();
        arrived.add(transition);
        this._gateArrivals.set(stateId, arrived);

        if (arrived.size < this._workflow.findInputTransitions(stateId).length) return false;

        this._openedGates.add(stateId);
        return true;
    }

    private completeToken(token: Token): void {
        this._tokens.delete(token.tokenId);
        this._history.push({ tokenId: token.tokenId, stateId: token.stateId, enteredAt: new Date(), outcome: 'completed' });
    }

    private failToken(token: Token, error: unknown, context: ExecutionContext): void {
        this._tokens.delete(token.tokenId);
        context.errors.push(error);
        this._history.push({ tokenId: token.tokenId, stateId: token.stateId, enteredAt: new Date(), outcome: 'failed', error });
    }

    private holdToken(token: Token): void {
        token.status = 'waiting';
        token.waitSequence = this._nextSequence++;
    }

}
