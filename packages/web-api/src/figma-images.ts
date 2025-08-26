/**
 * Figma Image API integration
 * Fetches real images from Figma using imageRef references
 */

interface FigmaImageOptions {
  fileKey: string;
  figmaToken: string;
  embedAsBase64?: boolean; // If true, downloads and converts to base64
}

interface ImageMapping {
  [imageRef: string]: string; // imageRef -> image URL
}

let imageCache = new Map<string, string>();

/**
 * Fetch image URL mappings from Figma API
 */
export const fetchFigmaImages = async (
  fileKey: string, 
  figmaToken: string
): Promise<ImageMapping> => {
  
  const cacheKey = `${fileKey}:images`;
  
  // Return cached result if available
  if (imageCache.has(cacheKey)) {
    return JSON.parse(imageCache.get(cacheKey)!);
  }
  
  try {
    console.log(`🖼️ Fetching image mappings for file ${fileKey}`);
    
    const response = await fetch(
      `https://api.figma.com/v1/files/${fileKey}/images`,
      {
        headers: {
          'X-Figma-Token': figmaToken
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const imageMapping = data.meta?.images || {};
    
    console.log(`✅ Retrieved ${Object.keys(imageMapping).length} image mappings`);
    
    // Cache the result
    imageCache.set(cacheKey, JSON.stringify(imageMapping));
    
    return imageMapping;
    
  } catch (error) {
    console.error('❌ Failed to fetch Figma images:', error);
    return {};
  }
};

/**
 * Download image and convert to base64
 */
export const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('❌ Failed to convert image to base64:', error);
    throw error;
  }
};

/**
 * Fetch SVG content for vector nodes from Figma API
 */
export const fetchNodeSVGs = async (
  nodes: any[],
  fileKey: string, 
  figmaToken: string
): Promise<void> => {
  // Collect all vector nodes that could be SVG candidates
  const vectorNodes: any[] = [];
  
  const collectVectorNodes = (node: any) => {
    if (node.type === 'VECTOR' && node.canBeFlattened) {
      vectorNodes.push(node);
    }
    if (node.children) {
      node.children.forEach(collectVectorNodes);
    }
  };
  
  nodes.forEach(collectVectorNodes);
  
  if (vectorNodes.length === 0) {
    console.log('🎨 No vector nodes found for SVG export');
    return;
  }
  
  console.log(`🎨 Found ${vectorNodes.length} vector nodes, fetching SVGs...`);
  
  // Fetch SVGs in batches (Figma API supports multiple node IDs)
  const nodeIds = vectorNodes.map(node => node.id).join(',');
  
  try {
    const response = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${nodeIds}&format=svg`,
      {
        headers: {
          'X-Figma-Token': figmaToken
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Figma SVG API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const svgUrls = data.images || {};
    
    // Download and attach SVG content to nodes
    await Promise.all(vectorNodes.map(async (node) => {
      const svgUrl = svgUrls[node.id];
      if (svgUrl) {
        try {
          const svgResponse = await fetch(svgUrl);
          const svgContent = await svgResponse.text();
          node.svg = svgContent;
          console.log(`✅ Attached SVG to ${node.name || node.id}`);
        } catch (error) {
          console.error(`❌ Failed to fetch SVG for ${node.id}:`, error);
        }
      }
    }));
    
  } catch (error) {
    console.error('❌ Failed to fetch SVGs from Figma:', error);
  }
};

/**
 * Process all image fills in nodes and resolve their URLs
 */
export const resolveImageFills = async (
  nodes: any[],
  options: FigmaImageOptions
): Promise<void> => {
  // Collect all imageRefs first
  const imageRefs = new Set<string>();
  
  const collectImageRefs = (node: any) => {
    if (node.fills && Array.isArray(node.fills)) {
      node.fills.forEach((fill: any) => {
        if (fill.type === 'IMAGE' && fill.imageRef) {
          imageRefs.add(fill.imageRef);
        }
      });
    }
    
    if (node.children) {
      node.children.forEach(collectImageRefs);
    }
  };
  
  nodes.forEach(collectImageRefs);
  
  if (imageRefs.size === 0) {
    console.log('📷 No image fills found');
    return;
  }
  
  console.log(`🔍 Found ${imageRefs.size} unique image references`);
  
  // Fetch image URL mappings from Figma
  const imageMapping = await fetchFigmaImages(options.fileKey, options.figmaToken);
  
  // Process each node to replace imageRefs with actual URLs/base64
  const processImageFills = async (node: any) => {
    if (node.fills && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === 'IMAGE' && fill.imageRef) {
          const imageUrl = imageMapping[fill.imageRef];
          
          if (imageUrl) {
            if (options.embedAsBase64) {
              // Convert to base64 for embedding
              try {
                fill.base64Url = await imageUrlToBase64(imageUrl);
                console.log(`📁 Converted image ${fill.imageRef} to base64`);
              } catch (error) {
                console.warn(`⚠️ Failed to convert image ${fill.imageRef} to base64, using URL`);
                fill.imageUrl = imageUrl;
              }
            } else {
              // Use direct URL
              fill.imageUrl = imageUrl;
              console.log(`🔗 Resolved image ${fill.imageRef} to ${imageUrl}`);
            }
          } else {
            console.warn(`⚠️ No URL found for image ref ${fill.imageRef}`);
          }
        }
      }
    }
    
    if (node.children) {
      await Promise.all(node.children.map(processImageFills));
    }
  };
  
  await Promise.all(nodes.map(processImageFills));
};

/**
 * Get image source for code generation
 */
export const getImageSource = (fill: any, fallbackWidth: number, fallbackHeight: number): string => {
  if (fill.base64Url) {
    return fill.base64Url;
  }
  
  if (fill.imageUrl) {
    return fill.imageUrl;
  }
  
  // Fallback to placeholder
  return `https://placehold.co/${fallbackWidth}x${fallbackHeight}`;
};

/**
 * Clear image cache (useful for testing)
 */
export const clearImageCache = () => {
  imageCache.clear();
  console.log('🗑️ Cleared image cache');
};
