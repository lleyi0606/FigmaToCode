/**
 * Mock Figma environment for server-side processing
 * This replicates essential Figma plugin APIs needed by the backend code
 */

const nodeCache = new Map<string, any>();

export const createFigmaMock = () => ({
  // Essential symbol for property checks
  mixed: Symbol('mixed'),
  
  // Mock node lookups
  getNodeByIdAsync: async (id: string) => {
    return nodeCache.get(id) || null;
  },
  
  // Mock variable system
  variables: {
    getVariableByIdAsync: async (id: string) => {
      // Return mock variable data
      return {
        id,
        name: `variable-${id.slice(-6)}`, // Use last 6 chars of ID
        resolvedType: 'COLOR',
        valuesByMode: {},
        remote: false,
        key: `var-${id}`
      };
    },
    
    getVariableById: (id: string) => {
      // Synchronous version - return mock data immediately
      return {
        id,
        name: `variable-${id.slice(-6)}`,
        resolvedType: 'COLOR',
        valuesByMode: {},
        remote: false,
        key: `var-${id}`
      };
    }
  },
  
  // Mock UI and messaging (no-ops for server)
  ui: {
    postMessage: () => {
      // No-op - server doesn't need UI messaging
    },
    onmessage: null
  },
  
  // Mock selection and colors
  getSelectionColors: () => {
    // Return empty array - server doesn't have selection
    return [];
  },
  
  // Mock storage
  clientStorage: {
    getAsync: async (key: string) => {
      // No persistent storage on server
      return null;
    },
    setAsync: async (key: string, value: any) => {
      // No-op
      return;
    }
  },
  
  // Mock page/selection (empty for server)
  currentPage: {
    selection: []
  },
  
  // Mock fonts
  listAvailableFontsAsync: async () => {
    // Return common web fonts
    return [
      { fontName: { family: 'Inter', style: 'Regular' } },
      { fontName: { family: 'Roboto', style: 'Regular' } },
      { fontName: { family: 'Arial', style: 'Regular' } },
    ];
  },
  
  // Helper methods for internal use
  _populateNodeCache: (nodes: any[]) => {
    const addToCache = (node: any) => {
      if (node.id) {
        nodeCache.set(node.id, node);
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(addToCache);
      }
    };
    
    nodes.forEach(addToCache);
    console.log(`📋 Populated node cache with ${nodeCache.size} nodes`);
  },
  
  _clearNodeCache: () => {
    nodeCache.clear();
    console.log('🗑️ Cleared node cache');
  },
  
  _getNodeCacheSize: () => nodeCache.size,
  
  // Mock mode (for plugins that check environment)
  mode: 'DESIGN' as const,
  
  // Mock viewport
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  }
});

// Type augmentation to add our mock to global
declare global {
  var figma: ReturnType<typeof createFigmaMock>;
}

export type FigmaMock = ReturnType<typeof createFigmaMock>;
