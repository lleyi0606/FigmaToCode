# FigmaToCode Web API

A standalone web API that converts raw Figma JSON (from REST API) directly to code.

## Features

- ✅ **Accepts raw Figma JSON** - No plugin dependency required
- ✅ **Complete processing** - Server-side equivalent of `nodesToJSON()`
- ✅ **All frameworks supported** - Tailwind, HTML, Flutter, SwiftUI, Compose
- ✅ **Real-time conversion** - Fast API responses
- ✅ **Production ready** - Error handling, logging, health checks

## Quick Start

### Install Dependencies
```bash
cd packages/web-api
pnpm install
```

### Development
```bash
pnpm dev
# Server runs on http://localhost:3000
```

### Production
```bash
pnpm build
pnpm start
```

## API Usage

### Health Check
```bash
curl http://localhost:3002/health
```

### Convert Figma JSON to Code

#### Method 1: From File
```bash
curl -X POST http://localhost:3002/api/convert \
  -H "Content-Type: application/json" \
  -d @packages/web-api/examples/simple-button.json
```

#### Method 2: Inline JSON
```bash
curl -X POST http://localhost:3002/api/convert \
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
              "cornerRadius": 8
            }
          }
        }
      }
    },
    "settings": {
      "framework": "Tailwind",
      "jsx": true
    }
  }'
```

#### Method 3: Your Complex Example
```bash
curl -X POST http://localhost:3002/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "figmaData": {
      "data": {
        "document": {
          "58:8": {
            "document": {
              "id": "58:8",
              "name": "Website Hero",
              "type": "FRAME",
              "children": [
                {
                  "id": "58:9",
                  "name": "Navigation", 
                  "type": "FRAME",
                  "layoutMode": "HORIZONTAL",
                  "children": [
                    {
                      "id": "58:12",
                      "name": "Website Name",
                      "type": "TEXT",
                      "characters": "Catty",
                      "style": {
                        "fontFamily": "Inknut Antiqua",
                        "fontSize": 28
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    },
    "settings": {
      "framework": "Tailwind",
      "jsx": true
    }
  }'
```

## Input Formats Supported

The API accepts Figma JSON in **multiple formats**:

### Format 1: Figma REST API Response (Recommended)
This is what you get from `GET https://api.figma.com/v1/files/:key/nodes?ids=1:1`

```json
{
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
            "cornerRadius": 8
          }
        }
      }
    }
  },
  "settings": {
    "framework": "Tailwind",
    "jsx": true
  }
}
```

### Format 2: Direct Document Format
```json
{
  "figmaData": {
    "document": {
      "1:1": {
        "document": {
          "id": "1:1",
          "type": "RECTANGLE",
          // ... node properties
        }
      }
    }
  },
  "settings": { ... }
}
```

### Format 3: Direct Node Array
```json
{
  "figmaData": [
    {
      "id": "1:1",
      "type": "RECTANGLE",
      "name": "Button",
      // ... node properties  
    }
  ],
  "settings": { ... }
}
```

## How to Get Figma JSON

### From Figma REST API
```bash
# Get your file key from Figma URL: figma.com/file/FILE_KEY/...
# Get node IDs from Figma (right-click → Copy link → extract node ID)

curl -H "X-Figma-Token: YOUR_FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY/nodes?ids=1:1,1:2"
```

### From Figma Plugin
In a Figma plugin, export nodes directly:
```javascript
const nodes = figma.currentPage.selection;
const jsonExport = await Promise.all(
  nodes.map(node => node.exportAsync({ format: "JSON_REST_V1" }))
);
```

### From Your Example
Your JSON is already in the correct format! Just use it as `figmaData`.

## Real Image Support

To use **real Figma images** instead of placeholders, add `figmaOptions` to your request:

```json
{
  "figmaData": { ... },
  "settings": { 
    "framework": "Tailwind",
    "embedImages": true 
  },
  "figmaOptions": {
    "fileKey": "ABC123XYZ789", // From figma.com/file/ABC123XYZ789/...
    "figmaToken": "figd_...", // Your Figma personal access token
    "embedAsBase64": true // true = embed base64, false = use Figma CDN URLs
  }
}
```

### **Image Processing Options**

| Setting | Result |
|---------|--------|
| No `figmaOptions` | 🔗 Placeholder: `https://placehold.co/WxH` |
| `embedAsBase64: false` | 🌐 Figma CDN: `https://s3-alpha.figma.com/img/...` |
| `embedAsBase64: true` | 📁 Base64: `data:image/png;base64,iVBORw0...` |

### **Getting Your Figma Token**
1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Create a **Personal Access Token**
3. Use token format: `figd_...`

### **Finding Your File Key**
From Figma URL: `https://www.figma.com/file/ABC123XYZ789/My-Design`
- File key = `ABC123XYZ789`

## Response Format

```json
{
  "success": true,
  "code": "// Generated code string",
  "htmlPreview": "<!-- HTML preview -->",
  "colors": [...],
  "gradients": [...], 
  "settings": {...},
  "warnings": [],
  "metadata": {
    "framework": "Tailwind",
    "nodeCount": 15,
    "processingTime": 250,
    "breakdown": {
      "processing": 180,
      "codeGeneration": 70
    }
  }
}
```

## Supported Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `framework` | string | **Required** | "Tailwind", "HTML", "Flutter", "SwiftUI", "Compose" |
| `jsx` | boolean | `false` | Generate JSX instead of HTML (Tailwind/HTML only) |
| `useColorVariables` | boolean | `true` | Process Figma color variables |
| `embedVectors` | boolean | `true` | Convert vector icons to SVG |
| `generatePreview` | boolean | `true` | Include HTML preview in response |
| `includeColorData` | boolean | `true` | Include color/gradient data |

## Framework-Specific Settings

### Tailwind
```json
{
  "framework": "Tailwind",
  "jsx": true,
  "roundTailwindValues": true,
  "roundTailwindColors": false,
  "customTailwindPrefix": "",
  "useTailwind4": false
}
```

### HTML
```json
{
  "framework": "HTML", 
  "htmlGenerationMode": "html", // "html", "jsx", "styled-components", "svelte"
  "inlineStyle": false,
  "showLayerNames": false
}
```

### Flutter
```json
{
  "framework": "Flutter",
  "flutterGenerationMode": "snippet" // "snippet", "stateless", "fullApp"
}
```

### SwiftUI
```json
{
  "framework": "SwiftUI",
  "swiftUIGenerationMode": "struct" // "snippet", "struct", "preview"
}
```

### Compose
```json
{
  "framework": "Compose",
  "composeGenerationMode": "composable" // "snippet", "composable", "screen"
}
```

## Error Handling

The API returns detailed error information:

```json
{
  "success": false,
  "error": "settings.framework is required",
  "details": "Additional debug info in development mode"
}
```

## Development

### Project Structure
```
src/
├── server.ts          # Main Express server
├── figma-mock.ts      # Mock Figma environment  
└── raw-processor.ts   # Raw JSON → AltNode processor
```

### Environment Variables
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Logging
The server logs processing steps:
```
🚀 Starting conversion request
📦 Extracted 1 raw nodes
⚙️ Processed nodes in 45ms, got 1 alt nodes  
💻 Generated code in 12ms
✅ Request completed in 67ms
```

## Examples

See `examples/` directory for sample requests:
- `simple-button.json` - Basic rectangle/button
- `complex-layout.json` - Nested frames with text
- `website-hero.json` - Your complex Website Hero example

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Railway/Vercel
The API works on any Node.js hosting platform. Set the start command to:
```bash
cd packages/web-api && npm start
```

## Architecture

The API replicates the exact processing pipeline from the Figma plugin:

1. **Input Validation** - Validate Figma JSON structure
2. **Node Extraction** - Extract nodes from API wrapper format  
3. **Raw Processing** - Convert to AltNode objects (equivalent to `nodesToJSON()`)
4. **Code Generation** - Use existing framework generators unchanged
5. **Response** - Return code + metadata

This ensures **100% compatibility** with the existing plugin codebase.
