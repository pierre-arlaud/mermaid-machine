import { ChartTransition } from './chart.js';
import { CheckContext, CheckHandler } from './context.js';

export class Transition<Document> {

    readonly from: string;
    readonly to: string;
    readonly label?: string;

    private _onCheckBefore?: CheckHandler<Document>;

    constructor(chartTransition: ChartTransition) {
        this.from = chartTransition.from;
        this.to = chartTransition.to;
        this.label = chartTransition.label;
    }

    onCheckBefore(predicate: CheckHandler<Document>): this {
        this._onCheckBefore = predicate;
        return this;
    }

    /**
     * Tells whether this transition may be crossed.
     * @returns Whether this transition may be crossed, i.e. the `onCheckBefore` predicate's result, or true when none is set.
     * @internal Called by WorkflowEngine only.
     */
    async checkBefore(context: CheckContext<Document>): Promise<boolean> {
        return this._onCheckBefore ? await this._onCheckBefore(context) : true;
    }

}
