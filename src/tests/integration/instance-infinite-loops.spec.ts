import { InstanceFailureError } from '../../domain/workflow-engine.js';
import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Infinite Loops', () => {

    it('loops until the looping condition ends', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/infinite-loop.mermaid');

        const workflow = new Workflow<{ lap: number }>(chart);
        workflow.states['A'].onRun(context => { context.document.lap++; });
        workflow.states['B'].findTransition({ to: 'End' }).onCheckBefore(context => context.document.lap >= 100);

        const instance = workflow.instantiate({ lap: 0 });
        await instance.start();

        expect(instance.document.lap).toBe(100);
        expect(instance.isCompleted).toBe(true);
    });

    it('prevents looping forever', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/infinite-loop.mermaid');

        const workflow = new Workflow<{ lap: number }>(chart);
        workflow.states['A'].onRun(context => { context.document.lap++; });
        workflow.states['B'].findTransition({ to: 'End' }).onCheckBefore(_context => false);

        const instance = workflow.instantiate({ lap: 0 }, { cascadeVisitLimit: 2000 });
        await expect(instance.start()).rejects.toThrow(InstanceFailureError);
        expect(instance.hasFailures).toBe(true);
        expect(instance.activeTokensAt('A')).toHaveLength(1);
        expect(instance.activeTokensAt('A')[0].status).toBe('failed');
        expect(instance.document.lap).toBe(2000);
    });

});
