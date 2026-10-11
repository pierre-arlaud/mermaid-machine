export interface CheckContext<Document> {
    readonly document: Readonly<Document>;
}

export interface RunContext<Document> extends CheckContext<Document> {
    readonly document: Document;
}

export interface ExecutionContext {
    errors: unknown[];
    /** How many times each state has been entered during this cascade, keyed by state id. */
    visits: Map<string, number>;
}

export type CheckHandler<Document> = (context: CheckContext<Document>, signal: AbortSignal) => boolean | Promise<boolean>;
export type RunHandler<Document> = (context: RunContext<Document>, signal: AbortSignal) => void | Promise<void>;
export type ExecutionHandler = (context: ExecutionContext) => void | Promise<void>;
