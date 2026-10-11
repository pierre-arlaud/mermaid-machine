import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Gate joining', () => {

    it('holds tokens on a join, and on a manual state before that join', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/gates-joining.mermaid');
        const workflow = new Workflow<Record<string, never>>(chart);

        const instance = workflow.instantiate({});
        await instance.start();

        expect(instance.activeTokensAt('Join')).toHaveLength(2);
        expect(instance.activeTokens().some(t => t.stateId === 'C')).toBe(true);
        expect(instance.activeTokens().some(t => t.stateId === 'B')).toBe(false);

        await instance.advanceManualStateTokenAt('C');

        expect(instance.activeTokensAt('Join')).toHaveLength(0);
        expect(instance.isCompleted).toBe(true);
    });
});
