import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

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
        await instance.start();
        expect(instance.activeStateIds()).toEqual(['HomePage']);

        // LoginPage holds the token as soon as it arrives through either of its incoming edges, where a gate would wait for all of them
        await instance.advanceManualStateTokenAt('HomePage', { label: 'Log in' });
        expect(instance.activeTokensAt('LoginPage')).toMatchObject([{ status: 'waiting' }]);

        // Both "Go back" transitions share a label, so the target disambiguates
        await instance.advanceManualStateTokenAt('LoginPage', { to: 'HomePage' });
        await instance.advanceManualStateTokenAt('HomePage', { label: 'Go to Dashboard' });
        expect(instance.activeTokensAt('LoginPage')).toMatchObject([{ status: 'waiting' }]);

        await instance.advanceManualStateTokenAt('LoginPage', { to: 'Login' });
        expect(instance.activeStateIds()).toEqual(['DashboardPage']);
    });

});
