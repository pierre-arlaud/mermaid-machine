import { MermaidParserService } from '../services/mermaid-parser.service.js';

// mermaid/JSDOM initialization is expensive and otherwise gets billed to whichever test runs first.
// Import this module (for its side effect) in any spec that parses mermaid files.
beforeAll(async () => {
    await new MermaidParserService().parseString('flowchart LR\n    A --> B');
});
