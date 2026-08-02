import { ChartWorkflow } from './chart.js';
import { State } from './state.js';

export class Workflow {
    readonly states: Record<string, State>;

    constructor(chart: ChartWorkflow) {
        this.states = {};
        for (const id of Object.keys(chart.states)) {
            this.states[id] = new State(chart.states[id], chart.transitions[id] ?? []);
        }
    }
}
