import { ChartState, ChartTransition, StateType } from './chart.js';
import { CheckContext, CheckHandler, RunContext, RunHandler } from './context.js';
import { Transition } from './transition.js';

export interface TransitionSelector {
    to?: string;
    label?: string;
}

export interface CheckResultOptions {
    /** Overrides the Instance-level default retry limit for this state only. */
    retries?: number;
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

    constructor(chartState: ChartState, outgoing: ChartTransition[]) {
        this.id = chartState.id;
        this.type = chartState.type;
        this.label = chartState.label;
        this._transitions = outgoing.map(t => new Transition<Document>(t));
    }

    get retryLimit(): number | undefined {
        return this._retryLimit;
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

    onCheckBefore(predicate: CheckHandler<Document>): this {
        this._onCheckBefore = predicate;
        return this;
    }

    onRun(handler: RunHandler<Document>): this {
        this._onRun = handler;
        return this;
    }

    onCheckResult(predicate: CheckHandler<Document>, options?: CheckResultOptions): this {
        this._onCheckResult = predicate;
        if (options?.retries !== undefined) {
            this._retryLimit = options.retries;
        }
        return this;
    }

    async checkBefore(context: CheckContext<Document>): Promise<boolean> {
        return this._onCheckBefore ? await this._onCheckBefore(context) : true;
    }

    async run(context: RunContext<Document>): Promise<void> {
        if (this._onRun) {
            await this._onRun(context);
        }
    }

    async checkResult(context: CheckContext<Document>): Promise<boolean> {
        return this._onCheckResult ? await this._onCheckResult(context) : true;
    }

    hasCheckResult(): boolean {
        return this._onCheckResult !== undefined;
    }

}
