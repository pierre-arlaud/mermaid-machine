import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Gate joins duplicate inputs', () => {

    it('joins only once every duplicate input has delivered a token', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/gates-duplicate-inputs.mermaid');
        const workflow = new Workflow<undefined>(chart);

        const instance = workflow.instantiate(undefined);
        await instance.start();
        expect(instance.activeTokensAt('TwoSteps')).toHaveLength(2);

        // A token on one of the two inputs is not enough for the gate to join.
        await instance.advanceManualStateTokenAt('TwoSteps', { label: 'StepA' });
        expect(instance.isCompleted).toBe(false);
        expect(instance.activeTokensAt('Join').map(token => token.status)).toEqual(['joining']);

        await instance.advanceManualStateTokenAt('TwoSteps', { label: 'StepB' });
        expect(instance.isCompleted).toBe(true);

        // The tokens of both inputs have merged into the same new token.
        const merges = instance.history.filter(entry => entry.stateId === 'Join' && entry.outcome === 'merged');
        expect(merges).toHaveLength(2);
        const mergedInto = merges[0].mergedInto;
        expect(merges[1].mergedInto).toBe(mergedInto);

        // The merged token ran the gate once, then continued to the End state as a single token.
        expect(
            instance.history
                .filter(entry => entry.tokenId === mergedInto)
                .map(entry => `${ entry.stateId }:${ entry.outcome }`)
        ).toEqual(['Join:run', 'End:run', 'End:completed']);
    });

});
