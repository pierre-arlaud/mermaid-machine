import { ChartWorkflow, StateType } from '../../../domain/chart.js';
import { InstanceFailureError } from '../../../domain/instance.js';
import type { Token } from '../../../domain/instance.js';
import { Workflow } from '../../../domain/workflow.js';

interface TestDoc {
    value?: number;
}

/**
 * Builds a workflow made of a single start state `A` with no transitions.
 * @returns The workflow, starting at `A`.
 */
function buildSingleStateWorkflow(type: StateType): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
        states: { A: { id: 'A', type } },
        transitions: {},
        startStateIds: ['A']
    });
}

/**
 * Builds a workflow `A → B`.
 * @returns The workflow, starting at `A`.
 */
function buildLinearWorkflow(fromType: StateType, toType: StateType): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
        states: {
            A: { id: 'A', type: fromType },
            B: { id: 'B', type: toType }
        },
        transitions: {
            A: [{ from: 'A', to: 'B' }]
        },
        startStateIds: ['A']
    });
}

/**
 * Builds a workflow where auto state `A` leads to both manual states `B` and `C`.
 * @returns The workflow, starting at `A`.
 */
function buildChoiceWorkflow(): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
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
}

/**
 * Builds a workflow where auto state `Begin` reaches gate `Fork`, which leads to manual states `B` and `C`.
 * @returns The workflow, starting at `Begin`.
 */
function buildForkWorkflow(): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
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
}

/**
 * Builds the same workflow as `buildForkWorkflow`, with manual states `B` and `C` both leading to gate `Join`.
 * @returns The workflow, starting at `Begin`.
 */
function buildForkJoinWorkflow(): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
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
}

/**
 * Builds a workflow made of a lone manual state `A`, and an event state `Evt` leading to manual state `B`.
 * @returns The workflow, starting at `A`.
 */
function buildEventWorkflow(): Workflow<TestDoc> {
    return new Workflow<TestDoc>({
        states: {
            A: { id: 'A', type: 'manual' },
            Evt: { id: 'Evt', type: 'event' },
            B: { id: 'B', type: 'manual' }
        },
        transitions: {
            Evt: [{ from: 'Evt', to: 'B' }]
        },
        startStateIds: ['A']
    });
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

        it('never runs `onCheckBefore` on the state it is directly instantiated on', async () => {
            const checkBefore = vi.fn().mockReturnValue(true);
            const workflow = buildSingleStateWorkflow('start');
            workflow.states.A.onCheckBefore(checkBefore);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(checkBefore).not.toHaveBeenCalled();
        });

        it('runs implicit start auto states automatically', async () => {
            const onRun = vi.fn();
            const workflow = buildLinearWorkflow('auto', 'manual');
            workflow.states.A.onRun(onRun);

            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('runs implicit start manual states on arrival, then holds the token', async () => {
            const onRun = vi.fn();
            const workflow = buildLinearWorkflow('manual', 'manual');
            workflow.states.A.onRun(onRun);

            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'A', status: 'waiting' })]);
        });

        it('completes without throwing when a state has no outgoing transitions at all', async () => {
            const workflow = buildSingleStateWorkflow('auto');
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(instance.isCompleted).toBe(true);
        });

    });

    describe('manual states', () => {

        it('runs a manual state on arrival, and not again when advancing it', async () => {
            const onRun = vi.fn();
            const workflow = buildSingleStateWorkflow('manual');
            workflow.states.A.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            expect(onRun).toHaveBeenCalledTimes(1);

            await instance.advanceManualStateTokenAt('A');
            expect(onRun).toHaveBeenCalledTimes(1);
        });

        it('runs the outgoing checks after the `onRun` handler of the manual state', async () => {
            const workflow = buildLinearWorkflow('manual', 'manual');
            workflow.states.A.onRun(context => { context.document.value = 1; });
            workflow.states.A.findTransition().onCheckBefore(context => context.document.value === 1);
            const instance = workflow.instantiate({});

            await instance.start('A');
            await instance.advanceManualStateTokenAt('A');

            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('rejects `triggerState()` on a manual state', async () => {
            const workflow = buildSingleStateWorkflow('manual');
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.triggerState('A')).rejects.toThrow();
        });

        it('runs the body and completes a manual terminal state without needing a selector', async () => {
            const onRun = vi.fn();
            const workflow = buildSingleStateWorkflow('manual');
            workflow.states.A.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            await instance.advanceManualStateTokenAt('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isCompleted).toBe(true);
        });

        it('leaves a vetoed `advanceManualStateTokenAt()` waiting and retriable', async () => {
            const workflow = buildLinearWorkflow('manual', 'manual');
            let allowed = false;
            workflow.states.A.findTransition().onCheckBefore(() => allowed);
            const instance = workflow.instantiate({});

            await instance.start('A');

            await expect(instance.advanceManualStateTokenAt('A')).rejects.toThrow();
            expect(instance.isActive('A')).toBe(true);

            allowed = true;
            await instance.advanceManualStateTokenAt('A');

            expect(instance.activeStateIds()).toEqual(['B']);
        });

        it('resolves the oldest waiting token first via advanceManualStateTokenAt(stateId), FIFO', async () => {
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

            const waitingAtM = instance.activeTokensAt('M')
                .map(token => token.tokenId)
                .sort((a, b) => a - b);
            expect(waitingAtM).toHaveLength(2);
            const [, newerId] = waitingAtM;

            await instance.advanceManualStateTokenAt('M');

            expect(instance.activeTokensAt('M').map(token => token.tokenId))
                .toEqual([newerId]);

            await instance.advanceManualStateToken(newerId);
            expect(instance.isCompleted).toBe(true);
        });

        it('lists the tokens at a single state via activeTokensAt(stateId)', async () => {
            const instance = buildForkWorkflow().instantiate({});

            await instance.start('Begin');

            expect(instance.activeTokensAt('B')).toEqual([expect.objectContaining({ stateId: 'B', status: 'waiting' })]);
            expect(instance.activeTokensAt('Begin')).toEqual([]);
        });

    });

    describe('event states', () => {

        it('does not run an event state until triggered', async () => {
            const onRun = vi.fn();
            const workflow = buildEventWorkflow();
            workflow.states.Evt.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            expect(onRun).not.toHaveBeenCalled();

            await instance.triggerState('Evt');
            expect(onRun).toHaveBeenCalledTimes(1);
        });

        it('creates an independent token on each `triggerState()` call, repeatably', async () => {
            const onRun = vi.fn();
            const workflow = buildEventWorkflow();
            workflow.states.Evt.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');
            await instance.triggerState('Evt');
            await instance.triggerState('Evt');

            expect(onRun).toHaveBeenCalledTimes(2);
            expect(instance.activeTokensAt('B')).toHaveLength(2);
        });

        it('rejects `advanceManualStateTokenAt()` on an event state', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.advanceManualStateTokenAt('Evt')).rejects.toThrow();
        });

        it('rejects `triggerState()` before the instance has started', async () => {
            const onRun = vi.fn();
            const workflow = buildEventWorkflow();
            workflow.states.Evt.onRun(onRun);
            const instance = workflow.instantiate({});

            await expect(instance.triggerState('Evt')).rejects.toThrow('has not started');
            expect(onRun).not.toHaveBeenCalled();
        });

        it('rejects `triggerState()` on a completed instance, pointing to `reopenWithTrigger()`', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});
            await instance.start('A');
            await instance.advanceManualStateTokenAt('A');
            expect(instance.isCompleted).toBe(true);

            await expect(instance.triggerState('Evt')).rejects.toThrow('reopenWithTrigger()');
            expect(instance.isCompleted).toBe(true);
        });

    });

    describe('reopening', () => {

        it('reopens a completed instance by triggering an event state', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});
            await instance.start('A');
            await instance.advanceManualStateTokenAt('A');

            await instance.reopenWithTrigger('Evt');

            expect(instance.isCompleted).toBe(false);
            expect(instance.activeStateIds()).toEqual(['B']);

            // Once reopened, the instance runs like any other, so it can complete again and accepts triggers meanwhile.
            await instance.triggerState('Evt');
            await instance.advanceManualStateTokenAt('B');
            await instance.advanceManualStateTokenAt('B');
            expect(instance.isCompleted).toBe(true);
        });

        it('rejects `reopenWithTrigger()` on an instance still in progress', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});
            await instance.start('A');

            await expect(instance.reopenWithTrigger('Evt')).rejects.toThrow('still in progress');
        });

        it('rejects `reopenWithTrigger()` before the instance has started', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});

            await expect(instance.reopenWithTrigger('Evt')).rejects.toThrow('has not started');
        });

        it('rejects `reopenWithTrigger()` on a non-event state', async () => {
            const workflow = buildEventWorkflow();
            const instance = workflow.instantiate({});
            await instance.start('A');
            await instance.advanceManualStateTokenAt('A');

            await expect(instance.reopenWithTrigger('B')).rejects.toThrow('not "event"');
            expect(instance.isCompleted).toBe(true);
        });

    });

    describe('gate states', () => {

        it('fires a gate reached by exactly one incoming edge on first arrival', async () => {
            const onRun = vi.fn();
            const workflow = buildLinearWorkflow('auto', 'gate');
            workflow.states.B.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isCompleted).toBe(true);
        });

        it('does not run until every incoming edge has delivered, then runs exactly once', async () => {
            const onRun = vi.fn();
            const workflow = buildForkJoinWorkflow();
            workflow.states.Join.onRun(onRun);
            const instance = workflow.instantiate({});

            await instance.start('Begin');

            await instance.advanceManualStateTokenAt('B');
            expect(onRun).not.toHaveBeenCalled();
            expect(instance.activeTokensAt('Join').filter(token => token.status === 'joining')).toHaveLength(1);

            await instance.advanceManualStateTokenAt('C');
            expect(onRun).toHaveBeenCalledTimes(1);
            expect(instance.isCompleted).toBe(true);
        });

        it('records each consumed input token as merged into the token the gate creates', async () => {
            const workflow = buildForkJoinWorkflow();
            const instance = workflow.instantiate({});

            await instance.start('Begin');
            const branchTokenIds = instance.activeTokens().map(token => token.tokenId);
            await instance.advanceManualStateTokenAt('B');
            await instance.advanceManualStateTokenAt('C');

            // Fork is a single-input gate, so Begin's token was merged there too; only Join's merges matter here.
            const merges = instance.history.filter(entry => entry.outcome === 'merged' && entry.stateId === 'Join');
            const byId = (a: number, b: number): number => a - b;
            expect(merges.map(entry => entry.tokenId).sort(byId)).toEqual(branchTokenIds.sort(byId));

            // Both branches merged into the same new token, which then ran the gate and completed.
            const mergedInto = merges[0].mergedInto;
            expect(merges[1].mergedInto).toBe(mergedInto);
            expect(branchTokenIds).not.toContain(mergedInto);
            expect(instance.history.filter(entry => entry.tokenId === mergedInto).map(entry => `${ entry.stateId }:${ entry.outcome }`))
                .toEqual(['Join:run', 'Join:completed']);
        });

        it('queues extra arrivals on a gate input and consumes the oldest one each round', async () => {
            const onRun = vi.fn();
            const workflow = new Workflow<TestDoc>({
                states: {
                    W: { id: 'W', type: 'manual' },
                    E: { id: 'E', type: 'event' },
                    G: { id: 'G', type: 'gate' }
                },
                transitions: {
                    W: [{ from: 'W', to: 'G' }],
                    E: [{ from: 'E', to: 'G' }],
                    G: [{ from: 'G', to: 'W' }]
                },
                startStateIds: ['W']
            });
            workflow.states.G.onRun(onRun);
            const instance = workflow.instantiate({});
            const joiningAtG = (): Readonly<Token>[] => instance.activeTokensAt('G').filter(token => token.status === 'joining');
            const mergedAtG = (): number[] => instance.history
                .filter(entry => entry.stateId === 'G' && entry.outcome === 'merged')
                .map(entry => entry.tokenId);

            // Both event tokens queue on E's input while W's input has not delivered yet.
            await instance.start('W');
            await instance.triggerState('E');
            await instance.triggerState('E');
            const [oldest, newest] = joiningAtG().map(token => token.tokenId).sort((a, b) => a - b);
            expect(newest).toBeDefined();
            expect(onRun).not.toHaveBeenCalled();

            // W's arrival opens the gate with the oldest event token; the newest waits for the next round.
            await instance.advanceManualStateTokenAt('W');
            expect(onRun).toHaveBeenCalledTimes(1);
            expect(mergedAtG()).toContain(oldest);
            expect(joiningAtG().map(token => token.tokenId)).toEqual([newest]);

            await instance.advanceManualStateTokenAt('W');
            expect(onRun).toHaveBeenCalledTimes(2);
            expect(mergedAtG()).toContain(newest);
            expect(instance.activeStateIds()).toEqual(['W']);
        });

    });

    describe('crossing transitions', () => {

        it('excludes a transition based on its `onCheckBefore`', async () => {
            const workflow = buildChoiceWorkflow();
            workflow.states.A.findTransition({ to: 'B' }).onCheckBefore(() => false);
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(instance.activeStateIds()).toEqual(['C']);
        });

        it('excludes a transition based on the target state\'s `onCheckBefore`', async () => {
            const workflow = buildChoiceWorkflow();
            workflow.states.A.findTransition({ to: 'B' }).onCheckBefore(() => true);
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

            // The failed token stays at 'Stuck', and the sibling token on the 'Ok' state still waits.
            const statuses = instance.activeTokens().map(token => `${ token.stateId }:${ token.status }`);
            expect(statuses.sort()).toEqual(['Ok:waiting', 'Stuck:failed']);
        });

    });

    describe('failing tokens', () => {

        it('keeps a failed token at its state, so the instance is not completed', async () => {
            const error = new Error('boom');
            const workflow = buildLinearWorkflow('auto', 'auto');
            workflow.states.B.onRun(() => { throw error; });
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);

            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'B', status: 'failed', error })]);
            expect(instance.hasFailures).toBe(true);
            expect(instance.isCompleted).toBe(false);
        });

        it('fails on a branch and does not join with the failed token', async () => {
            const workflow = buildForkJoinWorkflow();
            workflow.states.C.onRun(() => { throw new Error('boom'); });
            const instance = workflow.instantiate({});

            // C runs on arrival, so its failure surfaces from `start()` while B's token waits.
            await expect(instance.start('Begin')).rejects.toThrow(InstanceFailureError);
            await instance.advanceManualStateTokenAt('B');

            const statuses = instance.activeTokens().map(token => `${ token.stateId }:${ token.status }`);
            expect(statuses.sort()).toEqual(['C:failed', 'Join:joining']);
            expect(instance.hasFailures).toBe(true);
            expect(instance.isCompleted).toBe(false);
        });

        it('cannot advance a failed manual token', async () => {
            const workflow = buildLinearWorkflow('manual', 'auto');
            workflow.states.A.onRun(() => { throw new Error('boom'); });
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);

            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'A', status: 'failed' })]);
            await expect(instance.advanceManualStateTokenAt('A')).rejects.toThrow('No token is currently waiting');
        });

        it('fails the token at the state it leaves when a check throws during a cascade', async () => {
            const error = new Error('boom');
            const workflow = buildLinearWorkflow('auto', 'auto');
            workflow.states.A.findTransition().onCheckBefore(() => { throw error; });
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);

            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'A', status: 'failed', error })]);
        });

        it('leaves the token waiting when a check throws on advancing a manual state', async () => {
            const workflow = buildLinearWorkflow('manual', 'auto');
            workflow.states.B.onCheckBefore(() => { throw new Error('boom'); });
            const instance = workflow.instantiate({});

            await instance.start('A');
            await expect(instance.advanceManualStateTokenAt('A')).rejects.toThrow('boom');

            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'A', status: 'waiting' })]);
        });

    });

    describe('retrying transitions', () => {

        it('throws once the default retry limit is reached', async () => {
            const onRun = vi.fn();
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun(onRun).onCheckResult(() => false);
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
        });

        it('uses the instance-level default retry limit passed to the constructor', async () => {
            const onRun = vi.fn();
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun(onRun).onCheckResult(() => false);
            const instance = workflow.instantiate({}, { defaultRetryLimit: 7 });

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
            expect(onRun).toHaveBeenCalledTimes(7);
        });

        it('runs until `onCheckResult` passes, up to the retry limit', async () => {
            const onRun = vi.fn();
            let attempts = 0;
            const workflow = buildSingleStateWorkflow('auto');

            workflow.states.A.onRun(onRun).onCheckResult(() => (++attempts >= 3));
            const instance = workflow.instantiate({}, { defaultRetryLimit: 5 });

            await instance.start('A');

            expect(onRun).toHaveBeenCalledTimes(3);
            expect(instance.isCompleted).toBe(true);
        });

        it('uses state retry option instead of the default', async () => {
            const onRun = vi.fn();
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun(onRun, { retries: 2 }).onCheckResult(() => false);
            const instance = workflow.instantiate({});

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
            expect(onRun).toHaveBeenCalledTimes(2);
        });

        it('rejects a default retry limit or cascade visit limit that is not a positive integer when instantiating', () => {
            const workflow = buildSingleStateWorkflow('auto');

            expect(() => workflow.instantiate({}, { defaultRetryLimit: 0 })).toThrow(RangeError);
            expect(() => workflow.instantiate({}, { cascadeVisitLimit: 1.5 })).toThrow(RangeError);
        });

        it('retries a throwing `onRun` until an attempt succeeds', async () => {
            let attempts = 0;
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun(() => {
                if (++attempts < 3) throw new Error('boom');
            });
            const instance = workflow.instantiate({});

            await instance.start('A');

            expect(attempts).toBe(3);
            expect(instance.isCompleted).toBe(true);
        });

    });

    describe('forking', () => {

        it('forks into one concurrent token per eligible outgoing transition', async () => {
            const onRunB = vi.fn();
            const onRunC = vi.fn();
            const workflow = buildForkWorkflow();
            workflow.states.B.onRun(onRunB);
            workflow.states.C.onRun(onRunC);
            const instance = workflow.instantiate({});

            await instance.start('Begin');

            expect(onRunB).toHaveBeenCalledTimes(1);
            expect(onRunC).toHaveBeenCalledTimes(1);
            expect(instance.activeStateIds().sort()).toEqual(['B', 'C']);
        });

    });

    describe('reaching timeout on an `onRun`', () => {

        it('will not wait forever if `onRun` never returns', async () => {
            const workflow = buildLinearWorkflow('auto', 'auto');
            workflow.states['A'].onRun(() => new Promise<void>(() => {}));
            const instance = workflow.instantiate({}, { defaultHandlerTimeout: 50, defaultRetryLimit: 1 });

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);
            expect(instance.activeTokens()).toEqual([expect.objectContaining({ stateId: 'A', status: 'failed' })]);
            expect(instance.isActive('B')).toBe(false);
        });

        it('aborts the signal given to `onRun` once it times out', async () => {
            let signal: AbortSignal | undefined;
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun((_context, given) => {
                signal = given;
                return new Promise<void>(() => {});
            });
            const instance = workflow.instantiate({}, { defaultHandlerTimeout: 50, defaultRetryLimit: 1 });

            await expect(instance.start('A')).rejects.toThrow(InstanceFailureError);

            expect(signal?.aborted).toBe(true);
        });

        it('rejects an invalid default handler timeout when instantiating', () => {
            const workflow = buildSingleStateWorkflow('auto');

            expect(() => workflow.instantiate({}, { defaultHandlerTimeout: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
        });

        it('does not time out with a default handler timeout of 0', async () => {
            const workflow = buildSingleStateWorkflow('auto');
            workflow.states.A.onRun(() => new Promise<void>(resolve => setTimeout(resolve, 30)));
            const instance = workflow.instantiate({}, { defaultHandlerTimeout: 0, defaultRetryLimit: 1 });

            await instance.start('A');

            expect(instance.isCompleted).toBe(true);
        });

    });

});
