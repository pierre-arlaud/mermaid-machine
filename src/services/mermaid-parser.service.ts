import { promises as fs } from 'fs';

import { JSDOM } from 'jsdom';

import { Node, NodeType, Transition, Workflow } from '../domain/workflow.js';

interface FlowVertex {
    id: string;
    text?: string;
    type?: string; // mermaid shape string; undefined for bare/untyped nodes
}

interface FlowEdge {
    start: string;
    end: string;
    text?: string; // "" when there's no label
}

interface FlowDb {
    getVertices(): Record<string, FlowVertex>;
    getEdges(): FlowEdge[];
}

export class MermaidParserService {

    async parseFile (path: string) {
        const graph = await fs.readFile(path, 'utf-8');
        return this.parseString(graph);
    }

    async parseString (graph: string): Promise<Workflow> {
        const db = await this.getFlowDb(graph);

        const vertices = db.getVertices();
        const nodes: Record<string, Node> = {};
        for (const id of Object.keys(vertices)) {
            const vertex = vertices[id];
            nodes[id] = {
                id: vertex.id,
                type: this.resolveNodeType(vertex),
                ...(vertex.text && vertex.text !== vertex.id ? { label: vertex.text } : {})
            };
        }

        const transitions: Record<string, Transition[]> = {};
        for (const edge of db.getEdges()) {
            if (!transitions[edge.start]) {
                transitions[edge.start] = [];
            }
            transitions[edge.start].push({
                from: edge.start,
                to: edge.end,
                ...(edge.text ? { label: edge.text } : {})
            });
        }

        const startNodes = Object.values(nodes)
            .filter(node => node.type === 'start')
            .map(node => node.id);

        return { nodes, transitions, startNodes };
    }

    private resolveNodeType (vertex: FlowVertex): NodeType {
        switch (vertex.type) {
            case undefined: return 'manual'; // bare node, no shape declared
            case 'circle': return 'start';   // (( ))
            case 'square': return 'auto';    // [ ]
            case 'round': return 'manual';   // ( )
            case 'diamond': return 'gate';   // { }
            case 'hexagon': return 'event';  // {{ }}
            default:
                console.warn(
                    `[mermaid-parser] Unsupported node shape "${ vertex.type }" on node "${ vertex.id }"; defaulting to "manual".`
                );
                return 'manual';
        }
    }

    private async getFlowDb (graph: string): Promise<FlowDb> {
        // Mermaid's bundle inlines its own DOMPurify and needs a browser-like environment window/document object
        // No external `dompurify` package or globalThis.DOMPurify wiring needed.
        const { window } = new JSDOM('');
        globalThis.window = window as unknown as Window & typeof globalThis;
        globalThis.document = window.document;

        const { default: mermaid } = await import('mermaid');
        await mermaid.initialize({
            startOnLoad: false
        });

        // `getDiagramFromText` calls .parse() internally
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(graph);
        // so .db is fully populated here
        return (diagram as any).db as FlowDb;
    }

}
