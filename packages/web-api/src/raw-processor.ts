/**
 * Raw Figma JSON processor
 * Converts raw Figma JSON (from REST API) into AltNode objects
 * that can be consumed by the existing backend generators
 */

// Extract nodes from Figma REST API wrapper format
export const extractNodesFromFigmaData = (figmaData: any): any[] => {
  const nodes: any[] = [];
  
  if (figmaData?.data?.document) {
    // Handle Figma REST API format: data.document.{nodeId}.document
    for (const nodeId in figmaData.data.document) {
      const nodeWrapper = figmaData.data.document[nodeId];
      if (nodeWrapper?.document) {
        nodes.push(nodeWrapper.document);
      }
    }
    console.log(`📦 Extracted ${nodes.length} nodes from data.document format`);
  } else if (figmaData?.document) {
    // Handle direct document format
    for (const nodeId in figmaData.document) {
      const nodeWrapper = figmaData.document[nodeId];
      if (nodeWrapper?.document) {
        nodes.push(nodeWrapper.document);
      } else if (nodeWrapper && typeof nodeWrapper === 'object' && nodeWrapper.id) {
        // Direct node object
        nodes.push(nodeWrapper);
      }
    }
    console.log(`📦 Extracted ${nodes.length} nodes from document format`);
  } else if (Array.isArray(figmaData)) {
    // Handle direct array of nodes
    nodes.push(...figmaData);
    console.log(`📦 Extracted ${nodes.length} nodes from array format`);
  } else {
    console.warn('⚠️ Unknown figmaData format, attempting direct node extraction');
    // Try to find node-like objects
    if (figmaData && typeof figmaData === 'object' && figmaData.id) {
      nodes.push(figmaData);
    }
  }
  
  return nodes;
};

export const processRawFigmaNodes = async (rawNodes: any[], settings: any) => {
  console.log(`⚙️ Processing ${rawNodes.length} raw nodes`);
  
  // Populate figma mock cache with all nodes for lookups
  if (global.figma?._populateNodeCache) {
    global.figma._populateNodeCache(rawNodes);
  }
  
  const processedNodes = [];
  
  // Track names for deduplication
  const nameCounters = new Map<string, number>();
  
  for (let i = 0; i < rawNodes.length; i++) {
    const rawNode = rawNodes[i];
    try {
      console.log(`🔄 Processing node ${i + 1}/${rawNodes.length}: ${rawNode.id || 'unknown'} (${rawNode.type})`);
      const altNode = await processRawNode(rawNode, null, settings, nameCounters);
      if (altNode) {
        if (Array.isArray(altNode)) {
          processedNodes.push(...altNode);
        } else {
          processedNodes.push(altNode);
        }
      }
      console.log(`✅ Successfully processed node: ${rawNode.id || 'unknown'}`);
    } catch (error) {
      console.error(`❌ Failed to process node ${rawNode.id || 'unknown'}:`, error);
      console.error('Error stack:', error.stack);
      console.error('Raw node data:', JSON.stringify(rawNode, null, 2));
      // Continue processing other nodes
    }
  }
  
  console.log(`✅ Successfully processed ${processedNodes.length} nodes`);
  return processedNodes;
};

const processRawNode = async (
  rawNode: any, 
  parent: any, 
  settings: any,
  nameCounters: Map<string, number>
): Promise<any | any[] | null> => {
  
  if (!rawNode.id) {
    console.warn('⚠️ Skipping node without ID');
    return null;
  }
  
  if (rawNode.visible === false) {
    console.log(`👻 Skipping invisible node: ${rawNode.name || rawNode.id}`);
    return null;
  }
  
  // 1. Basic properties - create AltNode
  const altNode: any = {
    ...rawNode,
    parent
  };
  
  // 1.5. Ensure required arrays exist (prevent undefined.length errors)
  if (!altNode.fills || !Array.isArray(altNode.fills)) {
    altNode.fills = [];
  }
  if (!altNode.strokes || !Array.isArray(altNode.strokes)) {
    altNode.strokes = [];
  }
  if (!altNode.effects || !Array.isArray(altNode.effects)) {
    altNode.effects = [];
  }
  
  // 2. Generate unique name
  const baseName = rawNode.name?.trim() || 'unnamed';
  const count = nameCounters.get(baseName) || 0;
  nameCounters.set(baseName, count + 1);
  altNode.uniqueName = count === 0 ? baseName : `${baseName}_${count.toString().padStart(2, '0')}`;
  
  // 3. Process positioning and dimensions
  if (rawNode.absoluteBoundingBox) {
    const bbox = rawNode.absoluteBoundingBox;
    
    if (parent?.absoluteBoundingBox) {
      // Calculate relative position to parent
      altNode.x = bbox.x - parent.absoluteBoundingBox.x;
      altNode.y = bbox.y - parent.absoluteBoundingBox.y;
    } else {
      // Top-level node - position relative to origin
      altNode.x = 0;
      altNode.y = 0;
    }
    
    altNode.width = bbox.width;
    altNode.height = bbox.height;
  }
  
  // 4. Handle rotation
  if (rawNode.rotation) {
    // Convert radians to degrees and invert (Figma uses different coordinate system)
    altNode.rotation = -rawNode.rotation * (180 / Math.PI);
    altNode.cumulativeRotation = (parent?.cumulativeRotation || 0) + (altNode.rotation || 0);
  } else {
    altNode.rotation = 0;
    altNode.cumulativeRotation = parent?.cumulativeRotation || 0;
  }
  
  // 5. Set layout defaults (essential for code generation)
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
    
    // Handle additional text properties
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
    
    // Copy text style properties to root level (expected by generators)
    if (rawNode.style) {
      Object.assign(altNode, rawNode.style);
    }
  }
  
  // 7. Process color variables
  if (settings.useColorVariables) {
    await processColorVariables(altNode, settings);
  }
  
  // 7.5. Process image fills
  if (rawNode.fills && Array.isArray(rawNode.fills)) {
    rawNode.fills.forEach((fill: any) => {
      if (fill && fill.type === 'IMAGE') {
        // If we have a resolved image URL or base64, use it
        if (fill.base64Url) {
          fill.resolvedImageUrl = fill.base64Url;
        } else if (fill.imageUrl) {
          fill.resolvedImageUrl = fill.imageUrl;
        } else {
          // Fallback to placeholder
          fill.resolvedImageUrl = `https://placehold.co/${Math.round(altNode.width || 100)}x${Math.round(altNode.height || 100)}`;
        }
      }
    });
  }
  
  // 8. Handle various node properties
  
  // Stroke properties
  if (rawNode.strokeWeight !== undefined) {
    altNode.strokeWeight = rawNode.strokeWeight;
  }
  if (rawNode.strokeAlign) {
    altNode.strokeAlign = rawNode.strokeAlign;
  }
  if (rawNode.individualStrokeWeights) {
    altNode.strokeTopWeight = rawNode.individualStrokeWeights.top;
    altNode.strokeBottomWeight = rawNode.individualStrokeWeights.bottom;
    altNode.strokeLeftWeight = rawNode.individualStrokeWeights.left;
    altNode.strokeRightWeight = rawNode.individualStrokeWeights.right;
  }
  
  // Corner radius
  if (rawNode.cornerRadius !== undefined) {
    altNode.cornerRadius = rawNode.cornerRadius;
  }
  if (rawNode.rectangleCornerRadii) {
    altNode.rectangleCornerRadii = rawNode.rectangleCornerRadii;
  }
  
  // Layout properties
  if (rawNode.itemSpacing !== undefined) {
    altNode.itemSpacing = rawNode.itemSpacing;
  }
  if (rawNode.primaryAxisSizingMode) {
    altNode.primaryAxisSizingMode = rawNode.primaryAxisSizingMode;
  }
  if (rawNode.counterAxisSizingMode) {
    altNode.counterAxisSizingMode = rawNode.counterAxisSizingMode;
  }
  
  // Other properties
  if (rawNode.constraints) {
    altNode.constraints = rawNode.constraints;
  }
  if (rawNode.componentId) {
    altNode.componentId = rawNode.componentId;
  }
  if (rawNode.overrides) {
    altNode.overrides = rawNode.overrides;
  }
  if (rawNode.interactions) {
    altNode.interactions = rawNode.interactions;
  }
  if (rawNode.effects) {
    altNode.effects = rawNode.effects;
  }
  
  // 9. Icon detection (for SVG embedding)
  // Enhanced logic: Allow vector children to be flattened even if parent could be flattened,
  // as long as the vector has actual geometry data
  const isIcon = isLikelyIcon(altNode);
  const hasVectorGeometry = rawNode.type === 'VECTOR' && rawNode.fillGeometry && rawNode.fillGeometry.length > 0;
  
  if (settings.embedVectors) {
    if (hasVectorGeometry) {
      // Always flatten vectors with geometry, regardless of parent
      altNode.canBeFlattened = true;
      console.log(`✅ Marked Vector ${altNode.name} as flattenable (has geometry)`);
    } else if (!parent?.canBeFlattened && isIcon) {
      // Use original logic for non-vectors
      altNode.canBeFlattened = true;
      console.log(`✅ Marked ${altNode.name} as flattenable (icon detection)`);
    } else {
      altNode.canBeFlattened = false;
      
      if (rawNode.type === 'VECTOR') {
        console.log(`🚫 Vector ${altNode.name} blocked - no geometry data`);
      }
    }
  } else {
    altNode.canBeFlattened = false;
  }
  
  // 9.5. Generate SVG from fillGeometry if available
  if (altNode.canBeFlattened && settings.embedVectors) {
    // Check if this node has geometry directly
    if (rawNode.fillGeometry && rawNode.fillGeometry.length > 0) {
      altNode.svg = generateSVGFromGeometry(rawNode, altNode);
      console.log(`🎨 Generated SVG for ${altNode.name} from own geometry`);
    } else {
      // Check if we should collect geometry from Vector children (like plugin does)
      const vectorChildren = collectVectorGeometry(rawNode);
      if (vectorChildren.length > 0) {
        altNode.svg = generateSVGFromChildren(vectorChildren, altNode);
        console.log(`🎨 Generated SVG for ${altNode.name} from ${vectorChildren.length} vector children`);
        
        // Mark vector children for removal since they're now flattened into parent
        vectorChildren.forEach(child => {
          child._flattenedIntoParent = true;
        });
      }
    }
  }
  
  // 10. Process children recursively
  if (rawNode.children && Array.isArray(rawNode.children) && rawNode.children.length > 0) {
    const processedChildren = [];
    
    for (const child of rawNode.children) {
      if (child.visible !== false && !child._flattenedIntoParent) {
        try {
          const processedChild = await processRawNode(child, altNode, settings, nameCounters);
          if (processedChild !== null) {
            if (Array.isArray(processedChild)) {
              processedChildren.push(...processedChild);
            } else {
              processedChildren.push(processedChild);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to process child node ${child.id || 'unknown'}:`, error);
          console.error('Error details:', (error as Error).stack);
          // Continue processing other children
        }
      }
    }
    
    altNode.children = processedChildren;
    
    // Check if node should be marked as relative positioning
    if (altNode.layoutMode === 'NONE' || 
        processedChildren.some((child: any) => child.layoutPositioning === 'ABSOLUTE')) {
      altNode.isRelative = true;
    }
  }
  
  // 11. Handle GROUP → FRAME conversion (matches plugin behavior)
  if (rawNode.type === 'GROUP') {
    altNode.type = 'FRAME';
    
    // If group had rotation, handle it properly
    if (altNode.rotation) {
      const groupRotation = altNode.rotation;
      altNode.rotation = 0; // Reset group rotation
      
      // Pass rotation to children via cumulativeRotation
      if (altNode.children) {
        altNode.children.forEach((child: any) => {
          child.cumulativeRotation = (child.cumulativeRotation || 0) + groupRotation;
        });
      }
    }
    
    // Return children directly (inline the group)
    return altNode.children || [];
  }
  
  // 12. Handle layout sizing edge cases
  const hasChildren = altNode.children && altNode.children.length > 0;
  
  // If layout sizing is HUG but there are no children, set it to FIXED
  if (altNode.layoutSizingHorizontal === 'HUG' && !hasChildren) {
    altNode.layoutSizingHorizontal = 'FIXED';
  }
  if (altNode.layoutSizingVertical === 'HUG' && !hasChildren) {
    altNode.layoutSizingVertical = 'FIXED';
  }
  
  return altNode;
};

// Helper: Create text segments from raw text node
const createTextSegments = (textNode: any) => {
  const baseSegmentName = (textNode.name || 'text')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
  
  // Create a single segment for the entire text
  // In a full implementation, you'd parse characterStyleOverrides to create multiple segments
  const segment = {
    characters: textNode.characters,
    uniqueId: `${baseSegmentName}_span`,
    start: 0,
    end: textNode.characters.length,
    fontSize: textNode.style?.fontSize || 16,
    fontName: textNode.style?.fontFamily 
      ? { family: textNode.style.fontFamily, style: textNode.style.fontStyle || 'Regular' }
      : { family: 'Inter', style: 'Regular' },
    fills: textNode.fills || [],
    fontWeight: textNode.style?.fontWeight || 400,
    letterSpacing: textNode.style?.letterSpacing || 0,
    lineHeight: textNode.style?.lineHeight || { unit: 'AUTO' },
    textCase: textNode.style?.textCase || 'ORIGINAL',
    textDecoration: textNode.style?.textDecoration || 'NONE',
    // Add openTypeFeatures to prevent SUBS access error
    openTypeFeatures: {
      SUBS: false,
      SUPS: false,
      LIGA: true,
      KERN: true
    }
  };
  
  return [segment];
};

// Helper: Process color variables (simplified)
const processColorVariables = async (node: any, settings: any) => {
  try {
    // Process fills
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill && fill.type === 'SOLID' && fill.boundVariables?.color) {
          try {
            // Mock variable name resolution
            fill.variableColorName = `var-${fill.boundVariables.color.id.slice(-6)}`;
          } catch (error) {
            console.warn(`⚠️ Failed to resolve color variable ${fill.boundVariables.color.id}`);
          }
        }
      }
    }
    
    // Process strokes
    if (node.strokes && Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke && stroke.type === 'SOLID' && stroke.boundVariables?.color) {
          try {
            stroke.variableColorName = `var-${stroke.boundVariables.color.id.slice(-6)}`;
          } catch (error) {
            console.warn(`⚠️ Failed to resolve stroke color variable ${stroke.boundVariables.color.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error in processColorVariables for node ${node.id}:`, error);
  }
};

// Helper: Basic icon detection heuristics
const isLikelyIcon = (node: any): boolean => {
  if (!node.width || !node.height) return false;
  
  // Simple heuristics for icon detection
  const isSmall = node.width <= 48 && node.height <= 48;
  const isSquareish = Math.abs(node.width - node.height) <= Math.max(node.width, node.height) * 0.5;
  const hasVectorContent = node.type === 'VECTOR' || 
    (node.children && node.children.some((child: any) => child.type === 'VECTOR'));
  
  const couldBeIcon = isSmall && (isSquareish || hasVectorContent);
  
  if (couldBeIcon) {
    console.log(`🎨 Detected potential icon: ${node.name} (${node.width}x${node.height})`);
  }
  
  return couldBeIcon;
};

// Helper: Collect vector geometry from children (like plugin does)
const collectVectorGeometry = (node: any): any[] => {
  if (!node.children || !Array.isArray(node.children)) {
    return [];
  }
  
  const vectors = [];
  for (const child of node.children) {
    if (child.type === 'VECTOR' && child.fillGeometry && child.fillGeometry.length > 0) {
      vectors.push(child);
    }
  }
  
  return vectors;
};

// Helper: Generate SVG from multiple vector children
const generateSVGFromChildren = (vectorChildren: any[], parentNode: any): string => {
  const width = parentNode.width || 24;
  const height = parentNode.height || 24;
  
  // Collect all paths from all vector children
  const allPaths: string[] = [];
  
  for (const vector of vectorChildren) {
    if (vector.fillGeometry) {
      // Get fill color for this vector
      let fillColor = '#000000';
      if (vector.fills && vector.fills.length > 0) {
        const solidFill = vector.fills.find((fill: any) => fill.type === 'SOLID' && fill.visible !== false);
        if (solidFill && solidFill.color) {
          const r = Math.round(solidFill.color.r * 255);
          const g = Math.round(solidFill.color.g * 255);
          const b = Math.round(solidFill.color.b * 255);
          fillColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
      }
      
      // Add all geometry paths from this vector
      vector.fillGeometry.forEach((geometry: any) => {
        const fillRule = geometry.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero';
        allPaths.push(`<path d="${geometry.path}" fill="${fillColor}" fill-rule="${fillRule}"/>`);
      });
    }
  }
  
  if (allPaths.length === 0) {
    return '';
  }
  
  // Generate combined SVG
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${allPaths.join('\n  ')}
</svg>`;
  
  return svg;
};

// Helper: Generate SVG from fillGeometry path data
const generateSVGFromGeometry = (rawNode: any, altNode: any): string => {
  if (!rawNode.fillGeometry || !Array.isArray(rawNode.fillGeometry)) {
    return '';
  }
  
  const width = altNode.width || 24;
  const height = altNode.height || 24;
  
  // Get fill color for the SVG
  let fillColor = '#000000'; // Default black
  
  if (rawNode.fills && rawNode.fills.length > 0) {
    const solidFill = rawNode.fills.find((fill: any) => fill.type === 'SOLID' && fill.visible !== false);
    if (solidFill && solidFill.color) {
      const r = Math.round(solidFill.color.r * 255);
      const g = Math.round(solidFill.color.g * 255);
      const b = Math.round(solidFill.color.b * 255);
      fillColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }
  
  // Generate path elements from geometry
  const paths = rawNode.fillGeometry.map((geometry: any) => {
    const fillRule = geometry.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero';
    return `<path d="${geometry.path}" fill="${fillColor}" fill-rule="${fillRule}"/>`;
  }).join('\n  ');
  
  // Generate complete SVG
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${paths}
</svg>`;
  
  return svg;
};
