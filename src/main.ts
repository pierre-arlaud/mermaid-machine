import { MermaidParserService } from './services/mermaid-parser.service.js';

const service = new MermaidParserService();
service.parseFile('src/tests/workflows/nodes-types.mermaid')
    .then(() => console.log('Done'));
