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
