export interface CheckContext<Document> {
    readonly document: Readonly<Document>;
}

export interface RunContext<Document> extends CheckContext<Document> {
    readonly document: Document;
}

export interface ExecutionContext {
    errors: unknown[];
}

export type CheckHandler<Document> = (context: CheckContext<Document>) => boolean | Promise<boolean>;
export type RunHandler<Document> = (context: RunContext<Document>) => void | Promise<void>;
export type ExecutionHandler = (context: ExecutionContext) => void | Promise<void>;
