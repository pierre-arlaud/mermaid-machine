import { promises as fs } from 'fs';

import { JSDOM } from 'jsdom';
import type { Mermaid } from 'mermaid';

import { ChartState, ChartTransition, ChartWorkflow, StateType } from '../domain/chart.js';

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

    // Shared by every instance so jsdom, mermaid and its bundled DOMPurify are set up once per process, on the first parse.
    private static _mermaid?: Promise<Mermaid>;

    private static loadMermaid (): Promise<Mermaid> {
        MermaidParserService._mermaid ??= (async () => {
            // Mermaid's bundle inlines its own DOMPurify and needs a browser-like environment window/document object.
            // DOMPurify binds to the window present when mermaid is first imported, so it must exist before the import below.
            // No external `dompurify` package or globalThis.DOMPurify wiring needed.
            const { window } = new JSDOM('');
            globalThis.window = window as unknown as Window & typeof globalThis;
            globalThis.document = window.document;

            const { default: mermaid } = await import('mermaid');
            mermaid.initialize({
                startOnLoad: false
            });
            return mermaid;
        })();
        return MermaidParserService._mermaid;
    }

    async parseFile (path: string) {
        const graph = await fs.readFile(path, 'utf-8');
        return this.parseString(graph);
    }

    async parseString (graph: string): Promise<ChartWorkflow> {
        const db = await this.getFlowDb(graph);

        const vertices = db.getVertices();
        const states: Record<string, ChartState> = {};
        for (const id of Object.keys(vertices)) {
            const vertex = vertices[id];
            states[id] = {
                id: vertex.id,
                type: this.resolveStateType(vertex),
                ...(vertex.text && vertex.text !== vertex.id ? { label: vertex.text } : {})
            };
        }

        const transitions: Record<string, ChartTransition[]> = {};
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

        const targeted = new Set(db.getEdges().map(edge => edge.end));
        this.assertValidChart(states, targeted);

        const declaredStartStateIds = Object.values(states)
            .filter(state => state.type === 'start')
            .map(state => state.id);

        const startStateIds = declaredStartStateIds.length > 0
            ? declaredStartStateIds
            : this.resolveSourceStates(states, targeted);

        return { states, transitions, startStateIds };
    }

    private assertValidChart (states: Record<string, ChartState>, targeted: Set<string>): void {
        for (const state of Object.values(states)) {
            // Event states are only ever activated by an explicit triggerState() call, never reached via a transition.
            if (state.type === 'event' && targeted.has(state.id)) {
                throw new Error(`Event state "${ state.id }" has an incoming edge; event states must have no inputs.`);
            }
        }
    }

    // Fallback when no state is explicitly declared start (([ ])): any state never targeted by an edge,
    // excluding event and gate states, neither of which is allowed as a start state.
    private resolveSourceStates (states: Record<string, ChartState>, targeted: Set<string>): string[] {
        return Object.keys(states)
            .filter(id => !targeted.has(id))
            .filter(id => states[id].type !== 'event' && states[id].type !== 'gate');
    }

    private resolveStateType (vertex: FlowVertex): StateType {
        switch (vertex.type) {
            case undefined: return 'auto';   // bare node, no shape declared
            case 'stadium': return 'start';  // ([ ])
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
        const mermaid = await MermaidParserService.loadMermaid();

        // `getDiagramFromText` calls .parse() internally, so .db is fully populated here.
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(graph);
        return diagram.db as unknown as FlowDb;
    }

}
