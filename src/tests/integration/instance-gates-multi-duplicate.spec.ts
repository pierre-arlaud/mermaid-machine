import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Gate multi joins duplicate arrows', () => {

    it('forks and joins multiple tokens towards the same gate', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/gates-multi-duplicate.mermaid');
        const workflow = new Workflow<undefined>(chart);

        let counter = 0;
        workflow.states['End'].onRun(_context => { counter++; });

        const instance = workflow.instantiate(undefined);
        await instance.start();

        expect(instance.isCompleted).toBe(true);
        expect(counter).toBe(2);

        // Each of the three duplicate arrows delivered its own token, all merged into the same new token.
        const merges = instance.history.filter(entry => entry.stateId === 'Multi' && entry.outcome === 'merged');
        expect(merges).toHaveLength(3);
        const mergedInto = merges[0].mergedInto;
        expect(merges.every(entry => entry.mergedInto === mergedInto)).toBe(true);

        // The merged token ran the gate once, then forked instead of completing.
        expect(
            instance.history
                .filter(entry => entry.tokenId === mergedInto)
                .map(entry => `${ entry.stateId }:${ entry.outcome }`)
        ).toEqual(['Multi:run']);

        // Each of the two duplicate output arrows carried its own token, which ran and completed on End separately.
        const completions = instance.history.filter(entry => entry.stateId === 'End' && entry.outcome === 'completed');
        expect(completions).toHaveLength(2);
        for (const { tokenId } of completions) {
            expect(
                instance.history
                    .filter(entry => entry.tokenId === tokenId)
                    .map(entry => `${ entry.stateId }:${ entry.outcome }`)
            ).toEqual(['End:run', 'End:completed']);
        }
    });

});
