export type NodeType = 'start' | 'manual' | 'auto' | 'gate' | 'event';

export interface Node {
  id: string;
  type: NodeType;
  label?: string;
}

export interface Transition {
  from: string;
  to: string;
  label?: string;
}

export interface Workflow {
  nodes: Record<string, Node>;
  transitions: Record<string, Transition[]>;
  startNodes: string[];
}
