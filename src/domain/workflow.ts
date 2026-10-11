import { ChartWorkflow } from './chart.js';
import { Instance, InstanceOptions } from './instance.js';
import { State } from './state.js';
import type { Transition } from './transition.js';

export class Workflow<Document> {

    readonly states: Record<string, State<Document>>;
    readonly startStateIds: readonly string[];

    private _frozen = false;

    constructor(chart: ChartWorkflow) {
        this.states = {};
        for (const id of Object.keys(chart.states)) {
            this.states[id] = new State<Document>(chart.states[id], chart.transitions[id] ?? []);
        }
        // Copied so that workflows built from the same chart never share it.
        this.startStateIds = [...chart.startStateIds];
    }

    /**
     * Constructs a new Instance of this workflow.
     * The first call validates this workflow and freezes its handlers, so every instance runs under the same rules.
     * To run under other handlers, build another Workflow from the same chart.
     * Call `start()` on the instance to begin execution.
     * @returns The new, not yet started Instance.
     * @throws {Error} If a state has more than one fallback, unless that state is a gate or a manual state.
     * @throws {RangeError} If `defaultHandlerTimeout` is negative, NaN, or above what timers support (overflow).
     * @throws {RangeError} If `defaultRetryLimit` or `cascadeVisitLimit` is not a positive integer.
     */
    instantiate(document: Document, options?: InstanceOptions): Instance<Document> {
        if (!this._frozen) {
            this.validate();
            for (const state of Object.values(this.states)) {
                state.freeze();
            }
            this._frozen = true;
        }
        return new Instance(this, document, options);
    }

    /**
     * Finds the transitions leading into the given state.
     * @returns Every state's outgoing transitions whose target is the given state, as the same instances `State.findTransitions()` returns.
     * @internal Called by WorkflowEngine only.
     */
    findInputTransitions(stateId: string): Transition<Document>[] {
        return Object.values(this.states)
            .flatMap(state => state.findTransitions())
            .filter(transition => transition.to === stateId);
    }

    /**
     * Checks that this workflow can run, stopping at the first problem found.
     * @throws {Error} If any validation fails.
     */
    private validate(): void {
        this.validateFallbacks();
    }

    /**
     * Checks that every state has at most one fallback, unless that state is a gate or a manual state.
     * @throws {Error} If such a state has more than one outgoing transition without a check.
     */
    private validateFallbacks(): void {
        // Gates fork to every eligible output and manual states follow the caller's selector,
        // so only the other states pick a single transition on their own.
        for (const state of Object.values(this.states)) {
            if (state.type === 'gate' || state.type === 'manual') continue;
            const fallbacks = state.findTransitions().filter(transition => !transition.hasCheckBefore());
            if (fallbacks.length > 1) {
                throw new Error(
                    `State "${ state.id }" has ${ fallbacks.length } transitions without onCheckBefore ` +
                    `(to ${ fallbacks.map(transition => `"${ transition.to }"`).join(', ') }); ` +
                    'only gates can fork, so at most one may be left without it as the fallback.'
                );
            }
        }
    }

}
