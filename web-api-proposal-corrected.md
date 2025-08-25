# FigmaToCode Web API Proposal (CORRECTED)

## CRITICAL: Oracle Analysis Results

The Oracle analysis reveals that my original proposal was **incorrect**. Here's what the plugin **actually** does:

### Actual Plugin Flow
1. `figma.currentPage.selection` → **SceneNode[]** (Figma runtime objects)
2. `nodesToJSON(selection, settings)` → **AltNode[]** (heavily processed JSON)
3. `convertToCode(altNodes, settings)` → **Generated code**
4. `generateHTMLPreview(altNodes, settings)` → **HTML preview** 
5. `retrieveColors/Gradients(framework)` → **Color/gradient data**
6. `postConversionComplete()` → **Complete payload to UI**

### The `nodesToJSON()` Function Does MASSIVE Processing
- Exports each SceneNode to JSON_REST_V1 format
- Handles rotations and coordinate transformations
- Processes color variables with memoized lookups  
- Detects icons for SVG flattening
- Sanitizes layout properties with defaults
- Recursively processes children with z-order adjustments
- Collects styled text segments via `getStyledTextSegments()`
- Maps color variables to names via `variableToColorName()`

## Two Web API Options

### Option A: Accept Pre-Processed AltNodes (RECOMMENDED)

#### Request Structure
```json
{
  "altNodes": [...], // Pre-processed AltNode objects from nodesToJSON()
  "settings": {
    "framework": "Tailwind" | "HTML" | "Flutter" | "SwiftUI" | "Compose",
    "useColorVariables": true,
    "embedVectors": true,
    // ... all other PluginSettings properties
  }
}
```

#### Server Implementation
```typescript
// packages/web-api/server.ts
import express from 'express';
import { convertToCode } from '../backend/src/common/retrieveUI/convertToCode';
import { generateHTMLPreview } from '../backend/src/html/htmlMain';
import { retrieveGenericSolidUIColors, retrieveGenericLinearGradients } from '../backend/src/common/retrieveUI/retrieveColors';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Minimal global setup
global.figma = { mixed: Symbol('mixed') };

app.post('/api/convert', async (req, res) => {
  try {
    const { altNodes, settings } = req.body;
    
    // Exact same sequence as plugin's run() function
    const code = await convertToCode(altNodes, settings);
    const htmlPreview = await generateHTMLPreview(altNodes, settings);
    const colors = await retrieveGenericSolidUIColors(settings.framework);
    const gradients = await retrieveGenericLinearGradients(settings.framework);
    
    // Match exact plugin response structure
    res.json({
      success: true,
      code,
      htmlPreview,
      colors,
      gradients,
      settings,
      warnings: [] // Global warnings would be collected during processing
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});
```

#### Usage Pattern
```javascript
// In Figma plugin or separate processor
const selection = figma.currentPage.selection;
const altNodes = await nodesToJSON(selection, settings);

// Send to web API
const response = await fetch('/api/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ altNodes, settings })
});
```

### Option B: Accept Raw Figma JSON (COMPLEX)

This would require replicating the **entire** `nodesToJSON()` processing pipeline server-side, including:
- Mocking `figma.exportAsync()`, `getStyledTextSegments()`, `variableToColorName()`  
- Replicating rotation handling, layout sanitization, icon detection
- Handling all plugin-only APIs and edge cases

**Complexity**: Very High  
**Risk**: High chance of subtle differences from plugin behavior  
**Maintenance**: Must keep server-side processing in sync with plugin changes

## Recommendation

**Use Option A** because:

1. **Exact parity** - Uses identical functions (`convertToCode`, `generateHTMLPreview`)
2. **Minimal complexity** - No need to replicate `nodesToJSON()` server-side
3. **Proven reliability** - Same code path as successful plugin
4. **Easy maintenance** - Changes to backend automatically work in API

The API becomes a **pure offload service** - the heavy node processing stays in the plugin environment where it works perfectly, and only the code generation moves to the server.

## Testing with cURL

```bash
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{
    "altNodes": [{
      "id": "1:1",
      "type": "RECTANGLE",
      "name": "Rectangle",
      "uniqueName": "rectangle_01",
      "width": 100,
      "height": 100,
      "x": 0,
      "y": 0,
      "fills": [{"type": "SOLID", "color": {"r": 1, "g": 0, "b": 0}}],
      "layoutMode": "NONE",
      "layoutSizingHorizontal": "FIXED",
      "layoutSizingVertical": "FIXED"
    }],
    "settings": {
      "framework": "Tailwind",
      "jsx": true,
      "useColorVariables": false,
      "embedVectors": true
    }
  }'
```

## Implementation Steps

1. **Create `packages/web-api`** with Express server
2. **Import existing backend functions** directly (`convertToCode`, `generateHTMLPreview`, etc.)
3. **Add minimal Figma mocking** (just `figma.mixed` symbol)
4. **Match exact plugin response structure** for UI compatibility
5. **Test with AltNode data** from plugin's `nodesToJSON()` output
6. **Add Docker support** for deployment

## Key Benefits

- **Perfect parity** - Identical to plugin behavior
- **Minimal complexity** - Reuses all existing logic unchanged
- **Future-proof** - Backend changes automatically work in API
- **High performance** - No redundant processing, just code generation offload

## Limitations

- **Requires plugin or preprocessor** - Can't accept raw Figma JSON directly
- **Not fully standalone** - Depends on something running `nodesToJSON()` first

For a truly standalone API that accepts raw Figma JSON, you'd need to implement Option B, but the complexity and maintenance burden is significant.
