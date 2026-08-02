import { ChartTransition } from './chart.js';

// `context` will become `Run<TDocument>` once the execution layer exists.
export type CheckHandler = (context: unknown) => boolean | Promise<boolean>;

export class Transition {

    readonly from: string;
    readonly to: string;
    readonly label?: string;

    private _onCheckBefore?: CheckHandler;

    constructor(chartTransition: ChartTransition) {
        this.from = chartTransition.from;
        this.to = chartTransition.to;
        this.label = chartTransition.label;
    }

    onCheckBefore(predicate: CheckHandler): this {
        this._onCheckBefore = predicate;
        return this;
    }

}
