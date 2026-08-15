import { ChartWorkflow } from '../../../domain/chart.js';
import { Workflow } from '../../../domain/workflow.js';

interface TestDoc {
    value?: number;
}

describe('Workflow', () => {

    it('should preserve the states from the chart and their properties', () => {
        const chart: ChartWorkflow = {
            states: {
                A: { id: 'A', type: 'start' },
                B: { id: 'B', type: 'manual', label: 'Review' }
            },
            transitions: {},
            startStateIds: ['A']
        };

        const workflow = new Workflow<TestDoc>(chart);

        expect(Object.keys(workflow.states)).toHaveLength(2);
        expect(workflow.states.A.id).toBe('A');
        expect(workflow.states.A.type).toBe('start');
        expect(workflow.states.A.label).toBeUndefined();
        expect(workflow.states.B.label).toBe('Review');
    });

    describe('finding incoming transitions', () => {

        const chart: ChartWorkflow = {
            states: {
                A: { id: 'A', type: 'start' },
                B: { id: 'B', type: 'auto' },
                C: { id: 'C', type: 'gate' }
            },
            transitions: {
                A: [{ from: 'A', to: 'B' }],
                B: [{ from: 'B', to: 'C' }]
            },
            startStateIds: ['A']
        };

        it('returns an empty array for a state with no incoming transitions', () => {
            const workflow = new Workflow<TestDoc>(chart);

            expect(workflow.findInputTransitions('A')).toEqual([]);
        });

        it('returns the sole incoming transition for a state reached once', () => {
            const workflow = new Workflow<TestDoc>(chart);

            expect(workflow.findInputTransitions('B')).toHaveLength(1);
            expect(workflow.findInputTransitions('B')[0].from).toBe('A');
        });

        it('returns every incoming transition for a state reached from multiple states', () => {
            const chartWithJoin: ChartWorkflow = {
                states: {
                    ...chart.states,
                    D: { id: 'D', type: 'gate' }
                },
                transitions: {
                    ...chart.transitions,
                    C: [{ from: 'C', to: 'D' }],
                    B: [{ from: 'B', to: 'C' }, { from: 'B', to: 'D' }]
                },
                startStateIds: ['A']
            };
            const workflow = new Workflow<TestDoc>(chartWithJoin);

            expect(workflow.findInputTransitions('D')).toHaveLength(2);
        });

    });

});
