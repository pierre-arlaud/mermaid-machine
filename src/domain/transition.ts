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

    // Used internally by Instance; defaults to eligible when no predicate is set.
    async checkBefore(context: CheckContext<Document>): Promise<boolean> {
        return this._onCheckBefore ? await this._onCheckBefore(context) : true;
    }

}
