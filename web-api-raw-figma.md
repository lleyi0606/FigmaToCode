# Web API: Raw Figma JSON → Code

## Overview
Accept raw Figma JSON (from REST API or JSON_REST_V1 export) and process it server-side to generate code.

## API Design

### Request
```json
{
  "figmaData": {
    "document": {
      "58:8": {
        "document": {
          "id": "58:8",
          "name": "Website Hero",
          "type": "FRAME",
          "children": [...],
          // ... rest of Figma node properties
        }
      }
    }
  },
  "settings": {
    "framework": "Tailwind",
    "useColorVariables": true,
    // ... other settings
  }
}
```

### Response
```json
{
  "success": true,
  "code": "...",
  "htmlPreview": "...",
  "warnings": [...]
}
```

## Server Implementation

### 1. Main Server
```typescript
// packages/web-api/server.ts
import express from 'express';
import { createFigmaMock } from './figma-mock';
import { processRawFigmaNodes } from './raw-processor';
import { convertToCode } from '../backend/src/common/retrieveUI/convertToCode';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/api/convert', async (req, res) => {
  try {
    // Setup mock Figma environment
    global.figma = createFigmaMock();
    
    const { figmaData, settings } = req.body;
    
    // Extract nodes from Figma REST API format
    const rawNodes = extractNodesFromFigmaData(figmaData);
    
    // Process raw Figma JSON into AltNodes
    const altNodes = await processRawFigmaNodes(rawNodes, settings);
    
    // Use existing backend functions
    const code = await convertToCode(altNodes, settings);
    
    res.json({
      success: true,
      code,
      metadata: {
        framework: settings.framework,
        nodeCount: altNodes.length
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

### 2. Figma Data Extractor
```typescript
// packages/web-api/raw-processor.ts

// Extract nodes from Figma REST API wrapper format
export const extractNodesFromFigmaData = (figmaData: any): any[] => {
  const nodes = [];
  
  if (figmaData?.data?.document) {
    // Handle Figma REST API format: data.document.{nodeId}.document
    for (const nodeId in figmaData.data.document) {
      const nodeWrapper = figmaData.data.document[nodeId];
      if (nodeWrapper?.document) {
        nodes.push(nodeWrapper.document);
      }
    }
  } else if (figmaData?.document) {
    // Handle direct document format
    for (const nodeId in figmaData.document) {
      const nodeWrapper = figmaData.document[nodeId];
      if (nodeWrapper?.document) {
        nodes.push(nodeWrapper.document);
      }
    }
  } else if (Array.isArray(figmaData)) {
    // Handle direct array of nodes
    nodes.push(...figmaData);
  }
  
  return nodes;
};

export const processRawFigmaNodes = async (rawNodes: any[], settings: any) => {
  const processedNodes = [];
  
  // Track names for deduplication
  const nameCounters = new Map<string, number>();
  
  for (const rawNode of rawNodes) {
    const altNode = await processRawNode(rawNode, null, settings, nameCounters);
    if (altNode) {
      processedNodes.push(altNode);
    }
  }
  
  return processedNodes;
};

const processRawNode = async (
  rawNode: any, 
  parent: any, 
  settings: any,
  nameCounters: Map<string, number>
): Promise<any> => {
  
  // 1. Basic properties
  const altNode = {
    ...rawNode,
    parent
  };
  
  // 2. Generate unique name
  const baseName = rawNode.name || 'unnamed';
  const count = nameCounters.get(baseName) || 0;
  nameCounters.set(baseName, count + 1);
  altNode.uniqueName = count === 0 ? baseName : `${baseName}_${count.toString().padStart(2, '0')}`;
  
  // 3. Process positioning
  if (rawNode.absoluteBoundingBox) {
    const bbox = rawNode.absoluteBoundingBox;
    
    if (parent?.absoluteBoundingBox) {
      // Calculate relative position to parent
      altNode.x = bbox.x - parent.absoluteBoundingBox.x;
      altNode.y = bbox.y - parent.absoluteBoundingBox.y;
    } else {
      // Top-level node
      altNode.x = 0;
      altNode.y = 0;
    }
    
    altNode.width = bbox.width;
    altNode.height = bbox.height;
  }
  
  // 4. Handle rotation
  if (rawNode.rotation) {
    // Convert radians to degrees
    altNode.rotation = -rawNode.rotation * (180 / Math.PI);
    altNode.cumulativeRotation = (parent?.cumulativeRotation || 0) + (altNode.rotation || 0);
  } else {
    altNode.rotation = 0;
    altNode.cumulativeRotation = parent?.cumulativeRotation || 0;
  }
  
  // 5. Set layout defaults
  altNode.layoutMode = rawNode.layoutMode || 'NONE';
  altNode.layoutSizingHorizontal = rawNode.layoutSizingHorizontal || 'FIXED';
  altNode.layoutSizingVertical = rawNode.layoutSizingVertical || 'FIXED';
  altNode.layoutGrow = rawNode.layoutGrow || 0;
  altNode.primaryAxisAlignItems = rawNode.primaryAxisAlignItems || 'MIN';
  altNode.counterAxisAlignItems = rawNode.counterAxisAlignItems || 'MIN';
  
  // Set padding defaults
  altNode.paddingLeft = rawNode.paddingLeft || 0;
  altNode.paddingRight = rawNode.paddingRight || 0;
  altNode.paddingTop = rawNode.paddingTop || 0;
  altNode.paddingBottom = rawNode.paddingBottom || 0;
  
  // 6. Process text nodes
  if (rawNode.type === 'TEXT' && rawNode.characters) {
    altNode.styledTextSegments = createTextSegments(rawNode);
    
    // Handle additional text properties from your example
    if (rawNode.characterStyleOverrides) {
      altNode.characterStyleOverrides = rawNode.characterStyleOverrides;
    }
    if (rawNode.styleOverrideTable) {
      altNode.styleOverrideTable = rawNode.styleOverrideTable;
    }
    if (rawNode.lineTypes) {
      altNode.lineTypes = rawNode.lineTypes;
    }
    if (rawNode.lineIndentations) {
      altNode.lineIndentations = rawNode.lineIndentations;
    }
  }
  
  // 7. Process color variables
  if (settings.useColorVariables) {
    await processColorVariables(altNode, settings);
  }
  
  // 8. Handle strokes and effects  
  if (rawNode.individualStrokeWeights) {
    altNode.strokeTopWeight = rawNode.individualStrokeWeights.top;
    altNode.strokeBottomWeight = rawNode.individualStrokeWeights.bottom;
    altNode.strokeLeftWeight = rawNode.individualStrokeWeights.left;
    altNode.strokeRightWeight = rawNode.individualStrokeWeights.right;
  }
  
  // Handle stroke properties
  if (rawNode.strokeWeight !== undefined) {
    altNode.strokeWeight = rawNode.strokeWeight;
  }
  if (rawNode.strokeAlign) {
    altNode.strokeAlign = rawNode.strokeAlign;
  }
  
  // Handle corner radius (single or per-corner)
  if (rawNode.cornerRadius !== undefined) {
    altNode.cornerRadius = rawNode.cornerRadius;
  }
  if (rawNode.rectangleCornerRadii) {
    altNode.rectangleCornerRadii = rawNode.rectangleCornerRadii;
  }
  
  // Handle layout spacing
  if (rawNode.itemSpacing !== undefined) {
    altNode.itemSpacing = rawNode.itemSpacing;
  }
  
  // Handle layout sizing modes
  if (rawNode.primaryAxisSizingMode) {
    altNode.primaryAxisSizingMode = rawNode.primaryAxisSizingMode;
  }
  if (rawNode.counterAxisSizingMode) {
    altNode.counterAxisSizingMode = rawNode.counterAxisSizingMode;
  }
  
  // Handle constraints
  if (rawNode.constraints) {
    altNode.constraints = rawNode.constraints;
  }
  
  // Handle component-specific properties
  if (rawNode.componentId) {
    altNode.componentId = rawNode.componentId;
  }
  if (rawNode.overrides) {
    altNode.overrides = rawNode.overrides;
  }
  
  // Handle interactions and effects
  if (rawNode.interactions) {
    altNode.interactions = rawNode.interactions;
  }
  if (rawNode.effects) {
    altNode.effects = rawNode.effects;
  }
  
  // 9. Icon detection
  altNode.canBeFlattened = settings.embedVectors && isLikelyIcon(altNode);
  
  // 10. Process children recursively
  if (rawNode.children && Array.isArray(rawNode.children)) {
    const processedChildren = [];
    
    for (const child of rawNode.children) {
      if (child.visible !== false) {
        const processedChild = await processRawNode(child, altNode, settings, nameCounters);
        if (processedChild) {
          if (Array.isArray(processedChild)) {
            processedChildren.push(...processedChild);
          } else {
            processedChildren.push(processedChild);
          }
        }
      }
    }
    
    altNode.children = processedChildren;
    
    // Check if node should be marked as relative
    if (altNode.layoutMode === 'NONE' || 
        processedChildren.some(child => child.layoutPositioning === 'ABSOLUTE')) {
      altNode.isRelative = true;
    }
  }
  
  // 11. Handle GROUP → FRAME conversion
  if (rawNode.type === 'GROUP') {
    altNode.type = 'FRAME';
    
    // If group had rotation, distribute to children
    if (altNode.rotation) {
      // Reset group rotation and pass to children via cumulativeRotation
      const groupRotation = altNode.rotation;
      altNode.rotation = 0;
      
      if (altNode.children) {
        altNode.children.forEach(child => {
          child.cumulativeRotation = (child.cumulativeRotation || 0) + groupRotation;
        });
      }
    }
  }
  
  return altNode;
};

// Helper: Create text segments from raw text node
const createTextSegments = (textNode: any) => {
  const baseSegmentName = textNode.name
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
  
  return [{
    characters: textNode.characters,
    uniqueId: `${baseSegmentName}_span`,
    start: 0,
    end: textNode.characters.length,
    fontSize: textNode.style?.fontSize || 16,
    fontName: textNode.style?.fontName || { family: 'Inter', style: 'Regular' },
    fills: textNode.fills || [],
    fontWeight: textNode.style?.fontWeight || 400,
    letterSpacing: textNode.style?.letterSpacing || 0,
    lineHeight: textNode.style?.lineHeight || { unit: 'AUTO' },
    textCase: textNode.style?.textCase || 'ORIGINAL',
    textDecoration: textNode.style?.textDecoration || 'NONE'
  }];
};

// Helper: Process color variables
const processColorVariables = async (node: any, settings: any) => {
  // Mock implementation - would need to resolve variable IDs to names
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === 'SOLID' && fill.boundVariables?.color) {
        fill.variableColorName = `var-${fill.boundVariables.color.id}`;
      }
    }
  }
  
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && stroke.boundVariables?.color) {
        stroke.variableColorName = `var-${stroke.boundVariables.color.id}`;
      }
    }
  }
};

// Helper: Basic icon detection
const isLikelyIcon = (node: any) => {
  if (!node.width || !node.height) return false;
  
  // Simple heuristics for icon detection
  const isSmall = node.width <= 48 && node.height <= 48;
  const isSquareish = Math.abs(node.width - node.height) <= Math.max(node.width, node.height) * 0.5;
  const hasVectorContent = node.type === 'VECTOR' || 
    (node.children && node.children.some(child => child.type === 'VECTOR'));
    
  return isSmall && (isSquareish || hasVectorContent);
};
```

### 3. Mock Figma Environment
```typescript
// packages/web-api/figma-mock.ts
export const createFigmaMock = () => ({
  mixed: Symbol('mixed'),
  
  // Mock variable resolution
  variables: {
    getVariableByIdAsync: async (id: string) => ({
      id,
      name: `variable-${id}`,
      resolvedType: 'COLOR'
    })
  },
  
  // No-op methods
  ui: { postMessage: () => {} },
  getSelectionColors: () => [],
  clientStorage: {
    getAsync: async () => null,
    setAsync: async () => {}
  }
});
```

## Testing

### With Raw Rectangle
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "figmaData": {
      "data": {
        "document": {
          "1:1": {
            "document": {
              "id": "1:1",
              "type": "RECTANGLE",
              "name": "Button",
              "absoluteBoundingBox": {"x": 0, "y": 0, "width": 120, "height": 40},
              "fills": [{"type": "SOLID", "color": {"r": 0.2, "g": 0.6, "b": 1}}],
              "cornerRadius": 8,
              "visible": true
            }
          }
        }
      }
    },
    "settings": {
      "framework": "Tailwind",
      "jsx": true,
      "useColorVariables": false
    }
  }'
```

### With Your Complex Example
```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "figmaData": {
      // Your full data structure from the example above
    },
    "settings": {
      "framework": "Tailwind",
      "jsx": true,
      "useColorVariables": false,
      "embedVectors": true
    }
  }'
```

## Key Benefits

- ✅ **Accepts raw Figma JSON** - No plugin dependency
- ✅ **Complete processing** - Replicates nodesToJSON() logic
- ✅ **Framework compatibility** - Works with all existing generators
- ✅ **Extensible** - Can handle complex nested structures

## Limitations

- **Text styling approximation** - Can't perfectly replicate getStyledTextSegments() 
- **Variable resolution** - Need external variable name mapping
- **Performance** - More processing overhead than pre-processed input
- **Maintenance** - Must keep processing logic in sync with plugin changes

This approach gives you a true standalone API that accepts raw Figma data and processes it completely server-side!
