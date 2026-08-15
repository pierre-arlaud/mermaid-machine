import { Workflow } from '../../domain/workflow.js';
import { MermaidParserService } from '../../services/mermaid-parser.service.js';
import '../setup.js';


describe('Parallelism', () => {

    it('forks at Fork and joins at Join exactly once', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/parallelism.mermaid');
        const workflow = new Workflow<void>(chart);
        const onJoinRun = vi.fn();
        workflow.states.Join.onRun(onJoinRun);

        const instance = workflow.instantiate(undefined);
        await instance.start('Start');
        await instance.advanceManualTokenAt('Start');

        // The JobA -> JobB branch has already auto-cascaded and been absorbed into Join's pending arrivals.
        expect(instance.activeStateIds()).toEqual(['Task']);
        expect(instance.isActive('Join')).toBe(false);

        await instance.advanceManualTokenAt('Task');

        expect(onJoinRun).toHaveBeenCalledTimes(1);
        expect(instance.activeStateIds()).toEqual(['End']);

        await instance.advanceManualTokenAt('End');
        expect(instance.isComplete).toBe(true);
    });

    it('lets Trigger fire independently while Task/Join are still in flight', async () => {
        const parser = new MermaidParserService();
        const chart = await parser.parseFile('src/tests/workflows/parallelism.mermaid');
        const workflow = new Workflow<void>(chart);
        const onJoinRun = vi.fn();
        workflow.states.Join.onRun(onJoinRun);

        const instance = workflow.instantiate(undefined);
        await instance.start('Start');
        await instance.advanceManualTokenAt('Start');

        expect(instance.activeStateIds()).toEqual(['Task']);

        await instance.triggerState('Trigger');

        // Trigger's own token reached End independently; the still-running Task/Join branch is untouched.
        expect(instance.activeStateIds().sort()).toEqual(['End', 'Task']);
        expect(instance.isComplete).toBe(false);

        // End is manual, not a gate, so Trigger's arrival and Join's (later) arrival are resolved separately.
        await instance.advanceManualTokenAt('End');
        expect(instance.activeStateIds()).toEqual(['Task']);
        expect(instance.isComplete).toBe(false);

        await instance.advanceManualTokenAt('Task');
        expect(onJoinRun).toHaveBeenCalledTimes(1);
        expect(instance.activeStateIds()).toEqual(['End']);

        await instance.advanceManualTokenAt('End');
        expect(instance.isComplete).toBe(true);
    });

});
