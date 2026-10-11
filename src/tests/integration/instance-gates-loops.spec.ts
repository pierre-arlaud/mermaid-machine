import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

describe('Gate loops', () => {

    it('waits for event triggers at gates', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/gates-loops.mermaid');
        const workflow = new Workflow<{ counter: number }>(chart);
        
        const instance = workflow.instantiate({ counter: 0 });
        await instance.start();
        await instance.advanceManualStateTokenAt('Start');
        
        // Token should get stuck on the gate until event
        expect(instance.activeTokens()).toHaveLength(1);
        expect(instance.activeStateIds()).toEqual(['Gate']);

        // Trigger the event, pass the gate
        await instance.triggerState('Ready');
        expect(instance.activeTokens()).toHaveLength(1);
        expect(instance.activeStateIds()).toEqual(['Buffer']);

        // It should loop back to the gate, with one token on the well
        await instance.advanceManualStateTokenAt('Buffer');
        expect(instance.activeTokensAt('Well')).toHaveLength(1);
        expect(instance.activeStateIds().includes('Gate')).toBe(true);

        // Passing the gate a second time
        await instance.triggerState('Ready');
        expect(instance.activeTokens()).toHaveLength(2);
        expect(instance.activeStateIds().includes('Well')).toBe(true); // from first time opening the gate
        expect(instance.activeStateIds().includes('Buffer')).toBe(true); // from second time opening the gate

        // After passing the buffer a second time, the well should have two tokens
        await instance.advanceManualStateTokenAt('Buffer');
        expect(instance.activeTokens()).toHaveLength(3);
        expect(instance.activeTokensAt('Well')).toHaveLength(2);
        expect(instance.activeStateIds()).toHaveLength(2);
        expect(instance.activeStateIds().includes('Gate')).toBe(true);
    });

});
