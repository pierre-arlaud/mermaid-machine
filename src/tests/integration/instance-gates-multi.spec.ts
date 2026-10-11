import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Gate multi joins', () => {

    it('forks and joins multiple transitions', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/gates-multi.mermaid');
        const workflow = new Workflow<Record<string, never>>(chart);

        const instance = workflow.instantiate({});
        await instance.start();

        // Both forked tokens reach the end of their branch
        expect(instance.isCompleted).toBe(true);
        expect(instance.activeTokens()).toHaveLength(0);
    });

});
