import { MermaidParserService } from '../services/mermaid-parser.service.js';

// mermaid/JSDOM initialization is expensive and would otherwise be billed to whichever spec file parses first.
// Registered in vitest.config.ts as a setup file, so the cost shows under "setup" instead of in any spec's duration.
await new MermaidParserService().parseString('flowchart LR\n    A --> B');
