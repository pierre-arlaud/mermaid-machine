import { MermaidParserService } from '../../../services/mermaid-parser.service.js';
import '../../setup.js';

describe('Mermaid Parser', () => {

    const parseFile = async (fileName: string) => {
        const parser = new MermaidParserService();
        return await parser.parseFile(`src/tests/workflows/${ fileName }.mermaid`);
    };

    it('should parse all supported node types', async () => {
        const chart = await parseFile('state-types');

        ['A', 'B', 'C', 'D', 'E'].forEach(id => {
            expect(chart.states[id]).toBeDefined();
        });
        expect(chart.states.A.type).toBe('start');
        expect(chart.states.B.type).toBe('auto');
        expect(chart.states.C.type).toBe('manual');
        expect(chart.states.D.type).toBe('gate');
        expect(chart.states.E.type).toBe('event');

        // Unsupported nodes should trigger a warning and be treated as manual nodes
        expect(chart.states.F).toBeDefined();
        expect(chart.states.F.type).toBe('manual');
    });

    it('should parse transitions including in cases involving parallelism', async () => {
        const chart = await parseFile('parallelism');

        ['Start', 'Fork', 'Task', 'JobA', 'JobB', 'Join', 'Trigger'].forEach(id => {
            expect(chart.states[id]).toBeDefined();
            expect(chart.transitions[id]).not.toHaveLength(0);
        });

        expect(chart.transitions.Start[0].to).toBe('Fork');
        expect(chart.transitions.Fork).toHaveLength(2);
        expect(chart.transitions.Fork.find(t => t.to === 'Task')).toBeDefined();
        expect(chart.transitions.Fork.find(t => t.to === 'JobA')).toBeDefined();

        expect(chart.transitions.Task[0].to).toBe('Join');
        expect(chart.transitions.JobA[0].to).toBe('JobB');
        expect(chart.transitions.JobB[0].to).toBe('Join');
        expect(chart.transitions.Join[0].to).toBe('End');
        expect(chart.transitions.Trigger[0].to).toBe('End');

        expect(chart.states.End).toBeDefined();
        expect(chart.transitions.End ?? []).toHaveLength(0);
    });

    it('should treat states with no inputs as start states by default', async () => {
        const chartNone = await parseFile('start-states-none');
        const chartOne = await parseFile('start-states-one');

        expect(chartNone.startStateIds).toEqual(['DoorA', 'DoorB']);
        expect(chartOne.startStateIds).toEqual(['DoorC']);
    });

    it('should exclude event states from the default start-state fallback', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseString(`
            flowchart LR
                A --> B
                Evt{{Full stop}} --> B
        `);

        expect(chart.startStateIds).toEqual(['A']);
    });

    it('should reject an event state that has an incoming edge', async () => {
        const parser = new MermaidParserService();

        await expect(parser.parseString(`
            flowchart LR
                A --> Evt{{Full stop}}
        `)).rejects.toThrow();
    });

});
