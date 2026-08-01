import { MermaidParserService } from '../services/mermaid-parser.service.js';

describe('Mermaid Parser', () => {

    const parseFile = async (fileName: string) => {
        const parser = new MermaidParserService();
        return await parser.parseFile(`src/tests/workflows/${ fileName }.mermaid`);
    };

    it('should parse all supported node types', async () => {
        const workflow = await parseFile('nodes-types');

        ['A', 'B', 'C', 'D', 'E'].forEach(id => {
            expect(workflow.nodes[id]).toBeDefined();
        });
        expect(workflow.nodes.A.type).toBe('start');
        expect(workflow.nodes.B.type).toBe('auto');
        expect(workflow.nodes.C.type).toBe('manual');
        expect(workflow.nodes.D.type).toBe('gate');
        expect(workflow.nodes.E.type).toBe('event');

        // Unsupported nodes should trigger a warning and be treated as manual nodes
        expect(workflow.nodes.F).toBeDefined();
        expect(workflow.nodes.F.type).toBe('manual');
    });

    it ('should parse transitions including in cases involving parallelism', async () => {
        const workflow = await parseFile('parallelism');
        
        ['Start', 'Fork', 'Task', 'JobA', 'JobB', 'Join', 'Trigger'].forEach(id => {
            expect(workflow.nodes[id]).toBeDefined();
            expect(workflow.transitions[id]).to.be.an('array').that.is.not.empty;
        });
        
        expect(workflow.transitions.Start[0].to).toBe('Fork');
        expect(workflow.transitions.Fork).toHaveLength(2);
        expect(workflow.transitions.Fork.find(t => t.to === 'Task')).to.not.be.null;
        expect(workflow.transitions.Fork.find(t => t.to === 'JobA')).to.not.be.null;

        expect(workflow.transitions.Task[0].to).toBe('Join');
        expect(workflow.transitions.JobA[0].to).toBe('JobB');
        expect(workflow.transitions.JobB[0].to).toBe('Join');
        expect(workflow.transitions.Join[0].to).toBe('End');
        expect(workflow.transitions.Trigger[0].to).toBe('End');
    
        expect(workflow.nodes.End).toBeDefined();
        expect(workflow.transitions.End ?? []).toHaveLength(0);
    });

});
