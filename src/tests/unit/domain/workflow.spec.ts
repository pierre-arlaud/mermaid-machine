import { ChartWorkflow } from '../../../domain/chart.js';
import { Workflow } from '../../../domain/workflow.js';

describe('Workflow', () => {

    it('should preserve the states from the chart and their properties', () => {
        const chart: ChartWorkflow = {
            states: {
                A: { id: 'A', type: 'start' },
                B: { id: 'B', type: 'manual', label: 'Review' }
            },
            transitions: {},
            startStates: ['A']
        };

        const workflow = new Workflow(chart);

        expect(Object.keys(workflow.states)).toHaveLength(2);
        expect(workflow.states.A.id).toBe('A');
        expect(workflow.states.A.type).toBe('start');
        expect(workflow.states.A.label).toBeUndefined();
        expect(workflow.states.B.label).toBe('Review');
    });

});
