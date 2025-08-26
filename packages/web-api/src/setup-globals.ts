/**
 * Setup global Figma mock before any backend imports
 * This must be imported first to avoid ReferenceError
 */

const nodeCache = new Map<string, any>();

// Create and assign global figma before any backend imports
global.figma = {
  mixed: Symbol('mixed'),
  
  getNodeByIdAsync: async (id: string) => {
    return nodeCache.get(id) || null;
  },
  
  variables: {
    getVariableByIdAsync: async (id: string) => ({
      id,
      name: `variable-${id.slice(-6)}`,
      resolvedType: 'COLOR',
      valuesByMode: {},
      remote: false,
      key: `var-${id}`
    }),
    
    getVariableById: (id: string) => ({
      id,
      name: `variable-${id.slice(-6)}`,
      resolvedType: 'COLOR',
      valuesByMode: {},
      remote: false,
      key: `var-${id}`
    })
  },
  
  ui: {
    postMessage: () => {},
    onmessage: null
  },
  
  getSelectionColors: () => [],
  
  clientStorage: {
    getAsync: async () => null,
    setAsync: async () => {}
  },
  
  currentPage: {
    selection: []
  },
  
  listAvailableFontsAsync: async () => [
    { fontName: { family: 'Inter', style: 'Regular' } },
    { fontName: { family: 'Roboto', style: 'Regular' } },
  ],
  
  mode: 'DESIGN' as const,
  
  viewport: {
    center: { x: 0, y: 0 },
    zoom: 1
  },
  
  // Helper methods
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
  
  _getNodeCacheSize: () => nodeCache.size
};

// Type augmentation for global figma
declare global {
  var figma: {
    mixed: symbol;
    getNodeByIdAsync: (id: string) => Promise<any>;
    variables: {
      getVariableByIdAsync: (id: string) => Promise<any>;
      getVariableById: (id: string) => any;
    };
    ui: {
      postMessage: () => void;
      onmessage: any;
    };
    getSelectionColors: () => any[];
    clientStorage: {
      getAsync: () => Promise<any>;
      setAsync: () => Promise<void>;
    };
    currentPage: {
      selection: any[];
    };
    listAvailableFontsAsync: () => Promise<any[]>;
    mode: 'DESIGN';
    viewport: {
      center: { x: number; y: number };
      zoom: number;
    };
    _populateNodeCache: (nodes: any[]) => void;
    _clearNodeCache: () => void;
    _getNodeCacheSize: () => number;
  };
}

console.log('🔧 Global figma mock setup complete');
