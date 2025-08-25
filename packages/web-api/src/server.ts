// CRITICAL: Setup globals FIRST before any other imports
import './setup-globals';

import express from 'express';
import cors from 'cors';
import { extractNodesFromFigmaData, processRawFigmaNodes } from './raw-processor';
import { convertToCode } from '../../backend/src/common/retrieveUI/convertToCode';
import { generateHTMLPreview } from '../../backend/src/html/htmlMain';
import { retrieveGenericSolidUIColors, retrieveGenericLinearGradients } from '../../backend/src/common/retrieveUI/retrieveColors';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'FigmaToCode Web API is running' });
});

// Main conversion endpoint
app.post('/api/convert', async (req, res) => {
  try {
    console.log('🚀 Starting conversion request');
    const startTime = Date.now();
    
    const { figmaData, settings } = req.body;
    
    // Validate input
    if (!figmaData) {
      return res.status(400).json({
        success: false,
        error: 'figmaData is required'
      });
    }
    
    if (!settings?.framework) {
      return res.status(400).json({
        success: false,
        error: 'settings.framework is required'
      });
    }
    
    // Extract nodes from Figma REST API format
    const rawNodes = extractNodesFromFigmaData(figmaData);
    console.log(`📦 Extracted ${rawNodes.length} raw nodes`);
    
    if (rawNodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid nodes found in figmaData'
      });
    }
    
    // Process raw Figma JSON into AltNodes
    const processingStart = Date.now();
    const altNodes = await processRawFigmaNodes(rawNodes, settings);
    const processingTime = Date.now() - processingStart;
    console.log(`⚙️ Processed nodes in ${processingTime}ms, got ${altNodes.length} alt nodes`);
    
    if (altNodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No processable nodes found after conversion'
      });
    }
    
    // Generate code using existing backend functions
    const codeGenerationStart = Date.now();
    const code = await convertToCode(altNodes, settings);
    const codeGenerationTime = Date.now() - codeGenerationStart;
    console.log(`💻 Generated code in ${codeGenerationTime}ms`);
    
    // Generate HTML preview (optional, for debugging/preview purposes)
    let htmlPreview = '';
    if (settings.generatePreview !== false) {
      try {
        const previewResult = await generateHTMLPreview(altNodes, settings);
        htmlPreview = previewResult.content || '';
      } catch (previewError) {
        console.warn('⚠️ HTML preview generation failed:', previewError);
        // Continue without preview
      }
    }
    
    // Get color/gradient data (optional)
    let colors: any[] = [];
    let gradients: any[] = [];
    
    if (settings.includeColorData !== false) {
      try {
        colors = await retrieveGenericSolidUIColors(settings.framework);
        gradients = await retrieveGenericLinearGradients(settings.framework);
      } catch (colorError) {
        console.warn('⚠️ Color/gradient data retrieval failed:', colorError);
        // Continue without color data
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Request completed in ${totalTime}ms`);
    
    // Return response matching plugin format
    res.json({
      success: true,
      code,
      htmlPreview,
      colors,
      gradients,
      settings,
      warnings: [], // TODO: Collect warnings during processing
      metadata: {
        framework: settings.framework,
        nodeCount: altNodes.length,
        processingTime: totalTime,
        breakdown: {
          extraction: 0, // Could track this separately
          processing: processingTime,
          codeGeneration: codeGenerationTime
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Conversion failed:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('💥 Unhandled error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: {
      'GET /health': 'Health check',
      'POST /api/convert': 'Convert Figma JSON to code'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌟 FigmaToCode Web API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Convert endpoint: http://localhost:${PORT}/api/convert`);
});

export default app;
