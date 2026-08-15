import { ChartWorkflow } from './chart.js';
import { Instance, InstanceOptions } from './instance.js';
import { State } from './state.js';
import type { Transition } from './transition.js';

export class Workflow<Document> {

    readonly states: Record<string, State<Document>>;
    readonly startStateIds: string[];

    constructor(chart: ChartWorkflow) {
        this.states = {};
        for (const id of Object.keys(chart.states)) {
            this.states[id] = new State<Document>(chart.states[id], chart.transitions[id] ?? []);
        }
        this.startStateIds = chart.startStateIds;
    }

    /** Constructs a new Instance of this workflow. Call `start()` on the instance to begin execution. */
    instantiate(document: Document, options?: InstanceOptions): Instance<Document> {
        return new Instance(this, document, options);
    }

    findInputTransitions(stateId: string): Transition<Document>[] {
        return Object.values(this.states)
            .flatMap(state => state.findTransitions())
            .filter(transition => transition.to === stateId);
    }

}
