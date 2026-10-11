/**
 * Type of a workflow state (graph node).
 * - `start`: a state an instance can be initialized on, with `start()`; it runs like an `auto` state.
 *   Inferred start states can however be manual (see below).
 * - `auto`: runs as soon as a token enters it, then moves on depending on its transitions.
 * - `manual`: runs as soon as a token enters it, then holds the token until it is advanced manually.
 * - `event`: triggered externally, each trigger producing a new token; has no inputs.
 * - `gate`: can be used to both fork to every eligible output and join once every input has delivered a token.
 *
 * mermaid-machine reads Mermaid node shapes as state types:
 * - `[ ]` and bare nodes are auto states
 * - `( )` manual states
 * - `{ }` gates
 * - `{{ }}` events
 *
 * `([ ])` declares a start state, which runs automatically despite its rounded shape.
 * When no start state is declared, every node with no inputs (except gates and events) is a potential start state,
 * so a `( )` node with no inputs starts as manual.
 */
export type StateType = 'start' | 'manual' | 'auto' | 'gate' | 'event';

export interface ChartState {
    id: string;
    type: StateType;
    label?: string;
}

export interface ChartTransition {
    from: string;
    to: string;
    label?: string;
}

export interface ChartWorkflow {
    states: Record<string, ChartState>;
    transitions: Record<string, ChartTransition[]>;
    startStateIds: string[];
}
