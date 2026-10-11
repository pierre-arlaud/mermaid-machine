import type { ExecutionContext, ExecutionHandler } from './context.js';
import type { State, TransitionSelector } from './state.js';
import type { Transition } from './transition.js';
import type { Instance, InstanceOptions } from './instance.js';
import type { Workflow } from './workflow.js';
import { withTimeout } from '../utils/timeout.js';

export interface HistoryEntry {
    readonly tokenId: number;
    readonly stateId: string;
    /** When this entry was written. */
    readonly recordedAt: Date;
    readonly outcome: 'run' | 'completed' | 'failed' | 'merged';
    readonly error?: unknown;
    /** For a `'merged'` entry, the id of the token created on the gate from this and the other consumed tokens. */
    readonly mergedInto?: number;
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
    /**
     * What the token is doing at its current state.
     * `'running'` marks a token being moved forward, i.e. running its state or crossing a transition.
     * A token is "held" while it sits at a state without running, either `'waiting'` or `'joining'`.
     * `'waiting'` marks a token held at a manual state until it is advanced with `advanceManualStateToken()`.
     * `'joining'` marks a token held at a gate until every one of the gate's inputs has delivered a token.
     * `'failed'` marks a token left at the state where it failed, see `error`.
     */
    status: 'running' | 'waiting' | 'joining' | 'failed';
    /** For a `'failed'` token, what caused the failure. */
    error?: unknown;
    /**
     * The token's rank among held tokens, so the longest-held ones are chosen first.
     * Set on arrival at a manual state (`holdAtManualState()`) or at a gate (`holdAtGate()`), -1 for a token that has never been held.
     * Ranks can have gaps.
     */
    heldRank: number;
}

/** Runs a Workflow's graph for one Instance: owns token/join/settlement state and drives tokens through it. */
export class WorkflowEngine<Document> {

    private readonly _instance: Instance<Document>;
    private readonly _workflow: Workflow<Document>;
    private readonly _options: Readonly<Required<InstanceOptions>>;

    private readonly _tokens = new Map<number, Token>();
    private _nextSequence = 0;

    // The input transition each joining token arrived through, keyed by tokenId.
    private readonly _joinTransitions = new Map<number, Transition<Document>>();

    private readonly _history: HistoryEntry[] = [];

    private _initialized = false;

    constructor(instance: Instance<Document>, workflow: Workflow<Document>, options: Readonly<Required<InstanceOptions>>) {
        this._instance = instance;
        this._workflow = workflow;
        this._options = options;
    }

    get history(): readonly HistoryEntry[] {
        return this._history;
    }

    get isCompleted(): boolean {
        return this._initialized && this._tokens.size === 0;
    }

    get hasFailures(): boolean {
        return [...this._tokens.values()].some(token => token.status === 'failed');
    }

    activeTokens(): Readonly<Token>[] {
        return [...this._tokens.values()].map(token => ({ ...token }));
    }

    /**
     * Begins execution at the given state, or at the workflow's sole declared start state if omitted.
     * An explicit stateId must itself be a declared start state; event states are activated with `triggerState()` instead.
     * Must be called exactly once.
     * @throws {Error} If this engine has already started.
     * @throws {Error} If the given state does not exist or is not a declared start state.
     * @throws {Error} If no state is given and the workflow does not have exactly one start state.
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

    /**
     * Creates a new token on the given event state and runs a fresh cascade; repeatable by design while the instance is in progress.
     * @throws {Error} If the state does not exist or is not an event state, or if the instance has not started or has completed.
     * @throws {InstanceFailureError} If any token in that cascade failed.
     */
    async triggerState(stateId: string): Promise<void> {
        this.assertEventState(stateId);
        if (!this._initialized) throw new Error(`Cannot trigger "${ stateId }": the instance has not started.`);
        if (this.isCompleted) {
            throw new Error(`Cannot trigger "${ stateId }": the instance has completed; use reopenWithTrigger() instead.`);
        }
        await this.runEvent(stateId);
    }

    /**
     * Reopens a completed instance by triggering the given event state.
     * @throws {Error} If the state does not exist or is not an event state, or if the instance has not started or is still in progress.
     * @throws {InstanceFailureError} If any token in that cascade failed.
     */
    async reopenWithTrigger(stateId: string): Promise<void> {
        this.assertEventState(stateId);
        if (!this._initialized) throw new Error(`Cannot reopen at "${ stateId }": the instance has not started.`);
        if (!this.isCompleted) throw new Error(`Cannot reopen at "${ stateId }": the instance is still in progress.`);
        await this.runEvent(stateId);
    }

    /**
     * Advances the oldest token currently waiting at the given state.
     * Use `advanceManualStateToken()` directly to target a specific token.
     * A call rejected with an `Error` leaves the token waiting.
     * @throws {Error} If the state does not exist, is not a manual state or has no waiting token.
     * @throws {Error} If the selector does not match exactly one transition.
     * @throws {Error} If that transition or its target state is not eligible, or one of their checks throws or times out.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualStateTokenAt(stateId: string, selector: TransitionSelector = {}): Promise<void> {
        await this.advanceManualStateToken(this.findWaitingTokenAt(stateId).tokenId, selector);
    }

    /**
     * Advances a token through the selected transition.
     * The `onRun` handler was already invoked when the token arrived.
     * A call rejected with an `Error` leaves the token waiting.
     * @throws {Error} If the token is not waiting.
     * @throws {Error} If the selector does not match exactly one transition.
     * @throws {Error} If that transition or its target state is not eligible, or one of their checks throws or times out.
     * @throws {InstanceFailureError} If any token in the resulting cascade failed.
     */
    async advanceManualStateToken(tokenId: number, selector: TransitionSelector = {}): Promise<void> {
        // Validate the token can advance and make it run in a synchronous way.
        const token = this._tokens.get(tokenId);
        if (!token || token.status !== 'waiting') throw new Error(`No token ${ tokenId } is currently waiting.`);
        const state = this._workflow.states[token.stateId];
        if (!state) throw new Error(`Workflow has no state "${ token.stateId }".`);
        if (state.type !== 'manual') throw new Error(`State "${ token.stateId }" is "${ state.type }", not "manual".`);
        token.status = 'running';

        try {
            const outgoing = state.findTransitions();
            if (outgoing.length === 0) {
                // Reached a state with no output: the token's lifecycle has completed.
                this.completeToken(token);
            } else {
                // Find a valid transition and cross it.
                // The checks run after the `onRun` handler of the state, which already ran on arrival.
                const transition = state.findTransition(selector);
                if (!await this.checkTransitionBefore(transition)) {
                    throw new Error(`Transition from "${ state.id }" to "${ transition.to }" is not eligible.`);
                }
                const target = this._workflow.states[transition.to];
                if (!await this.checkStateBefore(target)) {
                    throw new Error(`State "${ transition.to }" is not eligible to be entered.`);
                }
                await this.executeCascade(context => this.crossTransition(token, transition, false, context));
            }
        } catch (error) {
            // Validation failed before commit: leave the token waiting so the caller can retry.
            // After commit, the token is no longer running (failed, held further on, or gone), so this is a no-op then.
            if (this._tokens.has(token.tokenId) && token.status === 'running') {
                token.status = 'waiting';
            }
            throw error;
        }
    }

    private assertEventState(stateId: string): void {
        const state = this._workflow.states[stateId];
        if (!state) throw new Error(`Workflow has no state "${ stateId }".`);
        if (state.type !== 'event') throw new Error(`State "${ stateId }" is "${ state.type }", not "event".`);
    }

    private async runEvent(stateId: string): Promise<void> {
        await this.executeCascade(context => this.enterState(this.createToken(stateId), context));
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
        const token: Token = { tokenId: this._nextSequence++, stateId, status: 'running', heldRank: -1 };
        this._tokens.set(token.tokenId, token);
        return token;
    }

    /**
     * Executes a cascade, while scoping potential errors in the execution context.
     * Failures in the execution are also recorded permanently by `failToken()` for `history`.
     */
    private async executeCascade(work: ExecutionHandler): Promise<void> {
        const context: ExecutionContext = { errors: [], visits: new Map() };
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

        // Find the token that's been waiting the longest on the given state.
        const waiting = [...this._tokens.values()]
            .filter(token => token.stateId === stateId && token.status === 'waiting')
            .sort((a, b) => a.heldRank - b.heldRank);
        if (waiting.length === 0) throw new Error(`No token is currently waiting at state "${ stateId }".`);
        return waiting[0];
    }

    private async enterState(token: Token, context: ExecutionContext): Promise<void> {
        const state = this._workflow.states[token.stateId];
        try {
            token.status = 'running';
            this.countVisit(state, context);
            await this.runState(token, state);
            if (state.type === 'manual') {
                this.holdAtManualState(token);
                return;
            }
            await this.exitState(token, state, context);
        } catch (error) {
            this.failToken(token, error, context);
        }
    }

    // Counted per state rather than as one total, so the limit reads as loop iterations whatever the loop's length.
    // The visits map is shared by every fork branch of the cascade, so a loop that forks on each lap is caught as well.
    private countVisit(state: State<Document>, context: ExecutionContext): void {
        const visits = (context.visits.get(state.id) ?? 0) + 1;
        if (visits > this._options.cascadeVisitLimit) {
            throw new Error(
                `State "${ state.id }" was entered more than ${ this._options.cascadeVisitLimit } times in a single cascade, ` +
                'assuming an infinite loop.'
            );
        }
        context.visits.set(state.id, visits);
    }

    private async runState(token: Token, state: State<Document>): Promise<void> {
        const limit = state.retryLimit ?? this._options.defaultRetryLimit;
        let lastError: unknown;
        for (let attempts = 1; attempts <= limit; attempts++) {
            let succeeded: boolean;
            try {
                await this.callHandler(`State "${ state.id }" onRun`, state.runTimeout, signal => state.run(this._instance, signal));
                succeeded = !state.hasCheckResult() || await this.callHandler(
                    `State "${ state.id }" onCheckResult`, state.checkResultTimeout, signal => state.checkResult(this._instance, signal)
                );
            } catch (error) {
                lastError = error;
                continue;
            }
            lastError = undefined;
            if (succeeded) {
                this._history.push({ tokenId: token.tokenId, stateId: state.id, recordedAt: new Date(), outcome: 'run' });
                return;
            }
        }
        // The last attempt's own error tells more than the exhaustion; only an `onCheckResult` returning false leaves none.
        if (lastError !== undefined) throw lastError;
        throw new Error(`State "${ state.id }" exhausted its retry limit (${ limit }).`);
    }

    private checkTransitionBefore(transition: Transition<Document>): Promise<boolean> {
        return this.callHandler(
            `Transition from "${ transition.from }" to "${ transition.to }" onCheckBefore`,
            transition.checkBeforeTimeout,
            signal => transition.checkBefore(this._instance, signal)
        );
    }

    private checkStateBefore(state: State<Document>): Promise<boolean> {
        return this.callHandler(
            `State "${ state.id }" onCheckBefore`,
            state.checkBeforeTimeout,
            signal => state.checkBefore(this._instance, signal)
        );
    }

    /**
     * Calls a handler under its own timeout, or under the instance's default when it has none.
     * @returns The handler's result.
     * @throws {Error} If the handler throws or times out.
     */
    private callHandler<T>(handlerName: string, timeout: number | undefined, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
        return withTimeout(handlerName, timeout ?? this._options.defaultHandlerTimeout, call);
    }

    private async exitState(token: Token, state: State<Document>, context: ExecutionContext): Promise<void> {
        const all = state.findTransitions();
        if (all.length === 0) {
            this.completeToken(token);
            return;
        }
        const eligible = await this.computeEligibleTransitions(state);
        if (state.type === 'gate') {
            // A gate crosses every eligible transition, forking into one new token per branch when there is more than one.
            if (eligible.length === 0) throw this.stuckError(state);
            const isFork = eligible.length > 1;
            await Promise.all(eligible.map(transition => this.crossTransition(token, transition, isFork, context)));
            return;
        }

        // Only gates split into parallel branches:
        // any other state crosses its single eligible transition with a check, or else its fallback.
        const checked = eligible.filter(transition => transition.hasCheckBefore());
        if (checked.length > 1) {
            throw new Error(
                `Ambiguous at "${ state.id }": ${ checked.length } transition(s) passed their onCheckBefore ` +
                `(to ${ checked.map(transition => `"${ transition.to }"`).join(', ') }), but only gates can fork.`
            );
        }
        // Workflow validation guarantees at most one fallback.
        const chosen = checked[0] ?? eligible.find(transition => !transition.hasCheckBefore());
        if (!chosen) throw this.stuckError(state);
        await this.crossTransition(token, chosen, false, context);
    }

    private stuckError(state: State<Document>): Error {
        return new Error(`Stuck at "${ state.id }": ${ state.findTransitions().length } transition(s) defined, none eligible.`);
    }

    private async computeEligibleTransitions(state: State<Document>): Promise<Transition<Document>[]> {
        const result: Transition<Document>[] = [];
        for (const transition of state.findTransitions()) {
            if (!await this.checkTransitionBefore(transition)) {
                continue;
            }
            const target = this._workflow.states[transition.to];
            if (!await this.checkStateBefore(target)) {
                continue;
            }
            result.push(transition);
        }
        return result;
    }

    private async crossTransition(
        sourceToken: Token,
        transition: Transition<Document>,
        isFork: boolean,
        context: ExecutionContext
    ): Promise<void> {
        const target = this._workflow.states[transition.to];

        // Each fork branch gets its own token; a single eligible transition is a plain continuation that keeps the token's identity.
        let token = sourceToken;
        if (isFork) {
            this._tokens.delete(sourceToken.tokenId);
            token = this.createToken(target.id);
        } else {
            sourceToken.stateId = target.id;
        }

        if (target.type === 'gate') {
            this.holdAtGate(token, transition);
            const merged = this.tryMergeAt(target.id);
            if (!merged) {
                return;
            }
            token = merged;
        }
        await this.enterState(token, context);
    }

    /**
     * Merges the tokens joining at the given gate into one new token, if every input transition has delivered one.
     * MUST stay synchronous.
     * JS's run-to-completion makes this operation (check then consume) atomic across concurrently-progressing fork branches.
     * @returns The merged token, created on the gate and not yet entered, or undefined if some input has no joining token yet
     * (the joining tokens are then left untouched).
     */
    private tryMergeAt(stateId: string): Token | undefined {
        const joining = [...this._tokens.values()]
            .filter(token => token.stateId === stateId && token.status === 'joining')
            .sort((a, b) => a.heldRank - b.heldRank);

        // The oldest joining token per input; extra arrivals on an input stay for a later round.
        const consumed: Token[] = [];
        for (const input of this._workflow.findInputTransitions(stateId)) {
            const token = joining.find(candidate => this._joinTransitions.get(candidate.tokenId) === input);
            if (!token) return undefined;
            consumed.push(token);
        }

        const merged = this.createToken(stateId);
        for (const token of consumed) {
            this._tokens.delete(token.tokenId);
            this._joinTransitions.delete(token.tokenId);
            this._history.push({ tokenId: token.tokenId, stateId, recordedAt: new Date(), outcome: 'merged', mergedInto: merged.tokenId });
        }
        return merged;
    }

    private completeToken(token: Token): void {
        this._tokens.delete(token.tokenId);
        this._history.push({ tokenId: token.tokenId, stateId: token.stateId, recordedAt: new Date(), outcome: 'completed' });
    }

    private failToken(token: Token, error: unknown, context: ExecutionContext): void {
        token.status = 'failed';
        token.error = error;
        context.errors.push(error);
        this._history.push({ tokenId: token.tokenId, stateId: token.stateId, recordedAt: new Date(), outcome: 'failed', error });
    }

    private holdAtManualState(token: Token): void {
        token.status = 'waiting';
        token.heldRank = this._nextSequence++;
    }

    private holdAtGate(token: Token, transition: Transition<Document>): void {
        token.status = 'joining';
        token.heldRank = this._nextSequence++;
        this._joinTransitions.set(token.tokenId, transition);
    }

}
