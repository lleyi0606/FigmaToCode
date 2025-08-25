# FigmaToCode Web API Proposal

## Overview
Transform the existing Figma plugin into a traditional REST API that accepts Figma design JSON and returns generated code.

## API Design

### Base URL
```
POST /api/convert
```

### Request Structure
```json
{
  "figmaData": {
    "nodes": [...], // Raw Figma JSON from REST API or JSON_REST_V1 export
    "document": {...} // Optional document metadata
  },
  "settings": {
    "framework": "Tailwind" | "HTML" | "Flutter" | "SwiftUI" | "Compose",
    "useColorVariables": true,
    "embedVectors": true,
    "jsx": true, // For HTML/Tailwind
    "inlineStyle": false, // For HTML
    "optimizeLayout": true,
    "layerName": "generate", // For naming
    "preview": false
  }
}
```

### Response Structure
```json
{
  "success": true,
  "code": "...", // Generated code string
  "preview": "...", // HTML preview (optional)
  "warnings": ["..."], // Any conversion warnings
  "metadata": {
    "framework": "Tailwind",
    "nodeCount": 15,
    "processingTime": 250
  }
}
```

## Implementation Approach

### 1. Create Express.js Server
```typescript
// packages/web-api/server.ts
import express from 'express';
import { createFigmaMock } from './figma-mock';
import { processRawFigmaData } from './figma-processor';
import { tailwindMain } from '../backend/src/tailwind/tailwindMain';
import { htmlMain } from '../backend/src/html/htmlMain';
import { flutterMain } from '../backend/src/flutter/flutterMain';
import { swiftuiMain } from '../backend/src/swiftui/swiftuiMain';
import { composeMain } from '../backend/src/compose/composeMain';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/api/convert', async (req, res) => {
  try {
    // Setup mock Figma environment
    global.figma = createFigmaMock();
    
    const { figmaData, settings } = req.body;
    
    // Process raw Figma JSON through nodesToJSON equivalent
    const processedNodes = await processRawFigmaData(figmaData.nodes, settings);
    
    // Generate code using existing framework generators
    let code: string;
    
    switch (settings.framework) {
      case 'Tailwind':
        code = await tailwindMain(processedNodes, settings);
        break;
      case 'HTML':
        const htmlResult = await htmlMain(processedNodes, settings);
        code = htmlResult.html;
        break;
      case 'Flutter':
        code = await flutterMain(processedNodes, settings);
        break;
      case 'SwiftUI':
        code = swiftuiMain(processedNodes, settings);
        break;
      case 'Compose':
        code = composeMain(processedNodes, settings);
        break;
      default:
        throw new Error(`Unsupported framework: ${settings.framework}`);
    }
    
    res.json({
      success: true,
      code,
      metadata: {
        framework: settings.framework,
        nodeCount: processedNodes.length
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});
```

### 2. Figma Environment Mock
```typescript
// packages/web-api/figma-mock.ts
const nodeCache = new Map();

export const createFigmaMock = () => ({
  mixed: Symbol('mixed'),
  
  // Mock node lookups
  getNodeByIdAsync: async (id: string) => {
    return nodeCache.get(id);
  },
  
  // Mock variable system
  variables: {
    getVariableByIdAsync: async (id: string) => ({
      id,
      name: `var-${id}`,
      resolvedType: 'COLOR',
    })
  },
  
  // Mock UI and other APIs
  ui: {
    postMessage: () => {},
  },
  
  getSelectionColors: () => [],
  
  clientStorage: {
    getAsync: async () => null,
    setAsync: async () => {}
  },
  
  // Helper to populate cache
  _populateNodeCache: (nodes: any[]) => {
    const addToCache = (node: any) => {
      nodeCache.set(node.id, node);
      if (node.children) {
        node.children.forEach(addToCache);
      }
    };
    nodes.forEach(addToCache);
  }
});
```

### 3. Figma Data Processor
```typescript
// packages/web-api/figma-processor.ts
import { processNodePair } from '../backend/src/altNodes/jsonNodeConversion';

export const processRawFigmaData = async (rawNodes: any[], settings: any) => {
  // Populate node cache for lookups
  global.figma._populateNodeCache(rawNodes);
  
  // Convert each raw node through the existing processing pipeline
  const processedNodes = [];
  
  for (const rawNode of rawNodes) {
    // Mock the SceneNode interface that processNodePair expects
    const mockSceneNode = {
      ...rawNode,
      // Add any missing SceneNode methods/properties
      exportAsync: async (options: any) => ({
        document: rawNode // Return the node as if it was exported
      }),
      getStyledTextSegments: (properties: string[]) => {
        // Mock text segments - would need proper implementation
        if (rawNode.type === 'TEXT' && rawNode.characters) {
          return [{
            characters: rawNode.characters,
            start: 0,
            end: rawNode.characters.length,
            fontSize: rawNode.style?.fontSize || 16,
            fontName: rawNode.style?.fontFamily || { family: 'Inter', style: 'Regular' },
            fills: rawNode.fills || []
          }];
        }
        return [];
      }
    };
    
    const processedNode = await processNodePair(
      rawNode,        // JSON node
      mockSceneNode,  // Mock Figma node
      settings,
      undefined,      // No parent
      0              // No rotation
    );
    
    if (processedNode) {
      if (Array.isArray(processedNode)) {
        processedNodes.push(...processedNode);
      } else {
        processedNodes.push(processedNode);
      }
    }
  }
  
  return processedNodes;
};
```

### 4. Package Structure
```
packages/
├── backend/              # Existing conversion logic (reused as-is)
├── web-api/              # New web API package
│   ├── server.ts         # Express server
│   ├── figma-mock.ts     # Mock Figma environment
│   ├── figma-processor.ts # Raw Figma JSON processor
│   └── package.json      # Dependencies: express, cors, etc.
└── types/               # Shared types
```

### 5. Docker Support
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:api"]
```

## Testing with cURL

### Basic Conversion
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "figmaData": {
      "nodes": [{
        "id": "1:1",
        "type": "RECTANGLE",
        "name": "Rectangle",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 100, "height": 100},
        "fills": [{"type": "SOLID", "color": {"r": 1, "g": 0, "b": 0}}],
        "strokes": [],
        "cornerRadius": 0,
        "visible": true
      }]
    },
    "settings": {
      "framework": "Tailwind",
      "jsx": true
    }
  }'
```

### Flutter Conversion
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "figmaData": {
      "nodes": [/* Raw Figma JSON from REST API */]
    },
    "settings": {
      "framework": "Flutter"
    }
  }'
```

## Implementation Steps

1. **Create `packages/web-api`** with Express server
2. **Implement Figma environment mocking** for plugin APIs
3. **Build raw Figma JSON processor** that replicates `nodesToJSON()` logic
4. **Handle plugin-only features** like `getStyledTextSegments`
5. **Add error handling** for conversion failures  
6. **Test with sample Figma exports** from Figma REST API
7. **Add Docker support** for deployment
8. **Document API endpoints** with OpenAPI spec

## Key Benefits

- **Standalone service** - No Figma plugin dependency
- **Batch processing** - Convert multiple designs via API
- **CI/CD integration** - Automate design-to-code workflows
- **Custom frontends** - Build web interfaces for conversion
- **Scalable** - Deploy as microservice

## Input Data Format

The API accepts **raw Figma JSON** (from REST API or JSON_REST_V1 export) and processes it server-side through the equivalent of `nodesToJSON()`.

### Expected Input Structure
```json
{
  "figmaData": {
    "nodes": [
      {
        "id": "1:1",
        "type": "RECTANGLE|TEXT|FRAME|GROUP|...",
        "name": "Node Name",
        "absoluteBoundingBox": {"x": 0, "y": 0, "width": 100, "height": 100},
        "fills": [...],
        "strokes": [...],
        "children": [...], // For container nodes
        "characters": "...", // For TEXT nodes
        // ... other Figma node properties
      }
    ]
  }
}
```

### Processing Pipeline
1. **Raw Figma JSON** → Mock Figma environment setup
2. **processRawFigmaData()** → Replicates `nodesToJSON()` processing
3. **processNodePair()** → Adds computed properties, handles rotations, etc.
4. **Framework generators** → Generate code from processed AltNodes

## Key Implementation Details

- **Full server-side processing** - No dependency on Figma plugin environment
- **Mock Figma APIs** - Replicate essential plugin APIs for existing code compatibility
- **Handle plugin-only features** - Mock `getStyledTextSegments`, variable lookups, etc.
- **Reuse existing generators** - All framework conversion logic works unchanged

## Challenges to Address

- **Plugin-only features** - Some functionality may need workarounds or approximations
- **Complex mocking** - Need to replicate Figma plugin environment accurately
- **Text styling** - `getStyledTextSegments` has no REST equivalent, needs manual parsing
- **Variable resolution** - Need to handle Figma design tokens/variables
- **Performance** - Large designs may need streaming/chunking
- **Authentication** - Add API keys for production use
