import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';
import '../setup.js';

interface TestDoc {
    value?: number;
}

describe('Transitions', () => {

    const parseWorkflow = async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/transitions.mermaid');
        return new Workflow<TestDoc>(chart);
    };

    it('does not wait for multiple incoming edges at a manual state, unlike a gate', async () => {
        const workflow = await parseWorkflow();

        const instance = workflow.instantiate({});
        await instance.start('HomePage');

        const atLoginPage = instance.activeTokensAt('LoginPage');
        expect(atLoginPage).toHaveLength(2);
        expect(instance.isActive('SubscriptionPage')).toBe(true);

        // Each arrival at LoginPage is independently triggerable
        await instance.advanceManualToken(atLoginPage[0].tokenId, { to: 'Login' });

        expect(instance.activeTokensAt('LoginPage')).toHaveLength(1);
        expect(instance.isActive('DashboardPage')).toBe(true);
    });

});
