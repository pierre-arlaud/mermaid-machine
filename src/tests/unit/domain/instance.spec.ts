import { ChartWorkflow } from '../../../domain/chart.js';
import { InstanceFailureError } from '../../../domain/instance.js';
import { Workflow } from '../../../domain/workflow.js';

interface TestDoc {
    value?: number;
}

describe('Instance', () => {

    describe('starting', () => {

        const chart: ChartWorkflow = {
            states: {
                A: { id: 'A', type: 'start' },
                B: { id: 'B', type: 'manual' }
            },
            transitions: {
                A: [{ from: 'A', to: 'B' }]
            },
            startStateIds: ['A']
        };

        it('resolves the only start state when none is given', async () => {
            const workflow = new Workflow<TestDoc>(chart);
            const instance = workflow.instantiate({});

            await instance.start();

            expect(instance.history.map(entry => entry.stateId)).toContain('A');
            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('uses the given state id to disambiguate among multiple declared start states', async () => {
            const workflow = new Workflow<TestDoc>({ ...chart, startStateIds: ['A', 'B'] });
            const instance = workflow.instantiate({});

            await instance.start('B');

            expect(instance.history.map(entry => entry.stateId)).not.toContain('A');
            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('throws when the given state id is not a declared start state', async () => {
            const workflow = new Workflow<TestDoc>(chart);
            const instance = workflow.instantiate({});

            await expect(instance.start('B')).rejects.toThrow();
        });

        it('throws when no state id is given and there is no declared start state', async () => {
            const workflow = new Workflow<TestDoc>({ ...chart, startStateIds: [] });
            const instance = workflow.instantiate({});

            await expect(instance.start()).rejects.toThrow();
        });

        it('throws when no state id is given and there are multiple declared start states', async () => {
            const workflow = new Workflow<TestDoc>({ ...chart, startStateIds: ['A', 'B'] });
            const instance = workflow.instantiate({});

            await expect(instance.start()).rejects.toThrow();
        });

        it('throws when the given state id does not exist', async () => {
            const workflow = new Workflow<TestDoc>(chart);
            const instance = workflow.instantiate({});

            await expect(instance.start('nope')).rejects.toThrow();
        });

        it('throws when the given state id is an event state', async () => {
            const workflow = new Workflow<TestDoc>({
                ...chart,
                states: { ...chart.states, Evt: { id: 'Evt', type: 'event' } }
            });
            const instance = workflow.instantiate({});

            await expect(instance.start('Evt')).rejects.toThrow();
        });

        it('throws when the given state id is a gate state', async () => {
            const workflow = new Workflow<TestDoc>({
                ...chart,
                states: { ...chart.states, G: { id: 'G', type: 'gate' } }
            });
            const instance = workflow.instantiate({});

            await expect(instance.start('G')).rejects.toThrow();
        });

        it('throws when called a second time on the same instance', async () => {
            const workflow = new Workflow<TestDoc>(chart);
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.start('A')).rejects.toThrow();
        });

        it('never runs onCheckBefore on the state it is directly instantiated on', async () => {
            const checkBefore = vi.fn().mockReturnValue(true);
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'start' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onCheckBefore(checkBefore);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(checkBefore).not.toHaveBeenCalled();
        });

        it('runs implicit start auto states automatically', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    B: { id: 'B', type: 'manual' }
                },
                transitions: {
                    A: [{ from: 'A', to: 'B' }]
                },
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun);

            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('does not run implicit start manual states automatically', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'manual' },
                    B: { id: 'B', type: 'manual' }
                },
                transitions: {
                    A: [{ from: 'A', to: 'B' }]
                },
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun);

            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).not.toHaveBeenCalled();
            expect(instance.activeStateIds()).toEqual(['A']);
        });

        it('completes without throwing when a state has no outgoing transitions at all', async () => {
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'auto' } },
                transitions: {},
                startStateIds: ['A']
            });
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(instance.isComplete).toBe(true);
        });

    });

    describe('manual states', () => {

        it('does not run a manual state until advanceManualTokenAt() is called', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'manual' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            expect(onRun).not.toHaveBeenCalled();

            await instance.advanceManualTokenAt('A');
            expect(onRun).toHaveBeenCalledTimes(1);
        });

        it('rejects triggerState() on a manual state', async () => {
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'manual' } },
                transitions: {},
                startStateIds: ['A']
            });
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.triggerState('A')).rejects.toThrow();
        });

        it('runs the body and completes a manual terminal state without needing a selector', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'manual' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            await instance.advanceManualTokenAt('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isComplete).toBe(true);
        });

        it('leaves a vetoed advanceManualTokenAt() waiting and retriable', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'manual' },
                    B: { id: 'B', type: 'manual' }
                },
                transitions: {
                    A: [{ from: 'A', to: 'B' }]
                },
                startStateIds: ['A']
            });
            let allowed = false;
            workflow.states.A.findTransition().onCheckBefore(() => allowed);
            const instance = workflow.instantiate({});

            await instance.start('A');

            await expect(instance.advanceManualTokenAt('A')).rejects.toThrow();
            expect(instance.isActive('A')).toBe(true);

            allowed = true;
            await instance.advanceManualTokenAt('A');

            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('resolves the oldest waiting token first via advanceManualTokenAt(stateId), FIFO', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    Begin: { id: 'Begin', type: 'auto' },
                    Fork: { id: 'Fork', type: 'gate' },
                    Mid: { id: 'Mid', type: 'auto' },
                    M: { id: 'M', type: 'manual' }
                },
                transitions: {
                    Begin: [{ from: 'Begin', to: 'Fork' }],
                    Fork: [
                        { from: 'Fork', to: 'M' },
                        { from: 'Fork', to: 'Mid' }
                    ],
                    Mid: [{ from: 'Mid', to: 'M' }]
                },
                startStateIds: ['Begin']
            });
            const instance = workflow.instantiate({});

            await instance.start('Begin');

            const waitingAtM = instance.activeTokens()
                .filter(token => token.stateId === 'M')
                .map(token => token.tokenId)
                .sort((a, b) => a - b);
            expect(waitingAtM).toHaveLength(2);
            const [, newerId] = waitingAtM;

            await instance.advanceManualTokenAt('M');

            expect(instance.activeTokens().filter(token => token.stateId === 'M').map(token => token.tokenId))
                .toEqual([newerId]);

            await instance.advanceManualToken(newerId);
            expect(instance.isComplete).toBe(true);
        });

    });

    describe('event states', () => {

        it('does not run an event state until triggered', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    Evt: { id: 'Evt', type: 'event' }
                },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.Evt.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            expect(onRun).not.toHaveBeenCalled();

            await instance.triggerState('Evt');
            expect(onRun).toHaveBeenCalledTimes(1);
        });

        it('creates an independent token on each triggerState() call, repeatably', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    Evt: { id: 'Evt', type: 'event' }
                },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.Evt.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            await instance.triggerState('Evt');
            await instance.triggerState('Evt');

            expect(onRun).toHaveBeenCalledTimes(2);
            expect(instance.isComplete).toBe(true);
        });

        it('rejects advanceManualTokenAt() on an event state', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    Evt: { id: 'Evt', type: 'event' }
                },
                transitions: {},
                startStateIds: ['A']
            });
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.advanceManualTokenAt('Evt')).rejects.toThrow();
        });

    });

    describe('gate states', () => {

        it('fires a gate reached by exactly one incoming edge on first arrival', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    G: { id: 'G', type: 'gate' }
                },
                transitions: {
                    A: [{ from: 'A', to: 'G' }]
                },
                startStateIds: ['A']
            });
            workflow.states.G.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isComplete).toBe(true);
        });

        it('does not run until every incoming edge has delivered, then runs exactly once', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    Begin: { id: 'Begin', type: 'auto' },
                    Fork: { id: 'Fork', type: 'gate' },
                    B: { id: 'B', type: 'manual' },
                    C: { id: 'C', type: 'manual' },
                    Join: { id: 'Join', type: 'gate' }
                },
                transitions: {
                    Begin: [{ from: 'Begin', to: 'Fork' }],
                    Fork: [
                        { from: 'Fork', to: 'B' },
                        { from: 'Fork', to: 'C' }
                    ],
                    B: [{ from: 'B', to: 'Join' }],
                    C: [{ from: 'C', to: 'Join' }]
                },
                startStateIds: ['Begin']
            });
            workflow.states.Join.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('Begin');

            await instance.advanceManualTokenAt('B');
            expect(onRun).not.toHaveBeenCalled();
            expect(instance.isActive('Join')).toBe(false);

            await instance.advanceManualTokenAt('C');
            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isComplete).toBe(true);
        });

        it('drops a re-arrival at an already-fired gate without re-invoking onRun or leaving a stray token', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    B: { id: 'B', type: 'auto' },
                    C: { id: 'C', type: 'auto' },
                    G: { id: 'G', type: 'gate' }
                },
                transitions: {
                    A: [
                        { from: 'A', to: 'B' },
                        { from: 'A', to: 'C' }
                    ],
                    B: [{ from: 'B', to: 'G' }],
                    C: [{ from: 'C', to: 'G' }],
                    G: [{ from: 'G', to: 'B' }]
                },
                startStateIds: ['A']
            });
            workflow.states.G.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isComplete).toBe(true);
        });

    });

    describe('crossing transitions', () => {

        it('excludes a transition based on its onCheckBefore', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    B: { id: 'B', type: 'manual' },
                    C: { id: 'C', type: 'manual' }
                },
                transitions: {
                    A: [
                        { from: 'A', to: 'B', label: 'no' },
                        { from: 'A', to: 'C', label: 'yes' }
                    ]
                },
                startStateIds: ['A']
            });
            workflow.states.A.findTransition({ label: 'no' }).onCheckBefore(() => false);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(instance.activeStateIds()).toEqual(['C']);
        });

        it('excludes a transition based on the target state\'s onCheckBefore', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    A: { id: 'A', type: 'auto' },
                    B: { id: 'B', type: 'manual' },
                    C: { id: 'C', type: 'manual' }
                },
                transitions: {
                    A: [
                        { from: 'A', to: 'B' },
                        { from: 'A', to: 'C' }
                    ]
                },
                startStateIds: ['A']
            });
            workflow.states.B.onCheckBefore(() => false);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(instance.activeStateIds()).toEqual(['C']);
        });

        it('fails only the failing token after branching', async () => {
            const workflow = new Workflow<TestDoc>({
                states: {
                    Begin: { id: 'Begin', type: 'auto' },
                    Fork: { id: 'Fork', type: 'gate' },
                    Stuck: { id: 'Stuck', type: 'auto' },
                    Dead: { id: 'Dead', type: 'manual' },
                    Ok: { id: 'Ok', type: 'manual' }
                },
                transitions: {
                    Begin: [{ from: 'Begin', to: 'Fork' }],
                    Fork: [
                        { from: 'Fork', to: 'Stuck' },
                        { from: 'Fork', to: 'Ok' }
                    ],
                    Stuck: [{ from: 'Stuck', to: 'Dead' }]
                },
                startStateIds: ['Begin']
            });
            workflow.states.Stuck.findTransition().onCheckBefore(() => false);

            const instance = workflow.instantiate({});
            await expect(instance.start('Begin')).rejects.toThrow(InstanceFailureError);

            // The sibling token on the 'Ok' state still exists.
            expect(instance.activeStateIds()).toEqual(['Ok']);
        });

    });

    describe('retrying transitions', () => {

        it('throws once the default retry limit is reached', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'auto' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun).onCheckResult(() => false);
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
        });

        it('uses the instance-level default retry limit passed to the constructor', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'auto' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun).onCheckResult(() => false);
            const instance = workflow.instantiate({}, { defaultRetryLimit: 7 });

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
            expect(onRun).toHaveBeenCalledTimes(7);
        });

        it('runs until onCheckResult passes, up to the retry limit', async () => {
            const onRun = vi.fn();
            let attempts = 0;
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'auto' } },
                transitions: {},
                startStateIds: ['A']
            });
            
            workflow.states.A.onRun(onRun).onCheckResult(() => (++attempts >= 3));
            const instance = workflow.instantiate({}, { defaultRetryLimit: 5 });

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(3);
            expect(instance.isComplete).toBe(true);
        });

        it('uses state retry option instead of the default', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: { A: { id: 'A', type: 'auto' } },
                transitions: {},
                startStateIds: ['A']
            });
            workflow.states.A.onRun(onRun).onCheckResult(() => false, { retries: 2 });
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
            expect(onRun).toHaveBeenCalledTimes(2);
        });

    });

    describe('forking', () => {

        it('forks into one concurrent token per eligible outgoing transition', async () => {
            const onRunB = vi.fn();
            const onRunC = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    Begin: { id: 'Begin', type: 'auto' },
                    Fork: { id: 'Fork', type: 'gate' },
                    B: { id: 'B', type: 'manual' },
                    C: { id: 'C', type: 'manual' }
                },
                transitions: {
                    Begin: [{ from: 'Begin', to: 'Fork' }],
                    Fork: [
                        { from: 'Fork', to: 'B' },
                        { from: 'Fork', to: 'C' }
                    ]
                },
                startStateIds: ['Begin']
            });
            workflow.states.B.onRun(onRunB);
            workflow.states.C.onRun(onRunC);
            const instance = workflow.instantiate({});

            await instance.start('Begin');

            expect(onRunB).not.toHaveBeenCalled();
            expect(onRunC).not.toHaveBeenCalled();
            expect(instance.activeStateIds().sort()).toEqual(['B', 'C']);
        });

    });

});
