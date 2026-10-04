import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';

interface TestDoc {
    value?: number;
}

describe('Parsed workflow state transitions integration', () => {

    const parseFile = async (fileName: string) => {
        const parser = new MermaidParserService();
        return await parser.parseFile(`src/tests/workflows/${ fileName }.mermaid`);
    };

    it('should find a single transition when there is only one', async () => {
        const chart = await parseFile('transitions');
        const workflow = new Workflow<TestDoc>(chart);

        expect(workflow.states.DashboardPage.findTransition()).toBeDefined();
        expect(workflow.states.Logout.findTransition({})).toBeDefined();
        expect(workflow.states.HomePage.findTransition({ label: 'Subscribe' })).toBeDefined();

        expect(() => workflow.states.HomePage.findTransition()).toThrow();
        expect(() => workflow.states.LoginPage.findTransition({ label: 'Go back '})).toThrow();
    });

    it('should find all transitions', async () => {
        const chart = await parseFile('transitions');
        const workflow = new Workflow<TestDoc>(chart);

        expect(workflow.states.HomePage.findTransitions()).toHaveLength(3);

        // Unexistent transition
        expect(workflow.states.DashboardPage.findTransitions({ to: 'LoginPage' })).toHaveLength(0);

        // Edge cases: 
        expect(workflow.states.HomePage.findTransitions({ to: 'LoginPage' })).toHaveLength(2);
        expect(workflow.states.LoginPage.findTransitions({ label: 'Go back' })).toHaveLength(2);
        
    });

});
