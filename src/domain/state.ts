import { ChartState, ChartTransition, StateType } from './chart.js';
import { CheckHandler, Transition } from './transition.js';

export interface TransitionSelector {
    to?: string;
    label?: string;
}

export type RunHandler = (context: unknown) => void | Promise<void>;

export class State {

    readonly id: string;
    readonly type: StateType;
    readonly label?: string;

    private readonly _transitions: Transition[];

    private _onCheckBefore?: CheckHandler;
    private _onRun?: RunHandler;
    private _onCheckResult?: CheckHandler;

    constructor(chartState: ChartState, outgoing: ChartTransition[]) {
        this.id = chartState.id;
        this.type = chartState.type;
        this.label = chartState.label;
        this._transitions = outgoing.map(t => new Transition(t));
    }

    onCheckBefore(predicate: CheckHandler): this {
        this._onCheckBefore = predicate;
        return this;
    }

    onRun(handler: RunHandler): this {
        this._onRun = handler;
        return this;
    }

    onCheckResult(predicate: CheckHandler): this {
        this._onCheckResult = predicate;
        return this;
    }

    findTransition(selector: TransitionSelector = {}): Transition {
        const matches = this.findTransitions(selector);
        if (matches.length !== 1) {
            throw new Error(
                `State "${this.id}" has ${matches.length} transitions matching ` +
                `${JSON.stringify(selector)}, expected exactly 1.`
            );
        }
        return matches[0];
    }

    findTransitions(selector: TransitionSelector = {}): Transition[] {
        return this._transitions.filter(t =>
            (selector.to === undefined || t.to === selector.to) &&
            (selector.label === undefined || t.label === selector.label)
        );
    }

}
