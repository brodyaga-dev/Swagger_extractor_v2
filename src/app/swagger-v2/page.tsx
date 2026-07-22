'use client';

import React, { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import SwaggerWrapper from "../../components/swagger-wrapper"

// Function to extract only specified methods from Swagger JSON and their referenced schemas
const extractSwaggerMethods = (swaggerJson: string, methodSpecs: string): string => {
  try {
    const swagger = JSON.parse(swaggerJson);
    
    // Handle wildcard case - extract all methods
    if (methodSpecs.trim() === '*') {
      return JSON.stringify(swagger, null, 2);
    }
    
    // Parse method specifications (e.g., "put:/pet,get:/user/{username}")
    const specs = methodSpecs.split(',').map(spec => {
      const [method, path] = spec.trim().split(':');
      return { method: method.toLowerCase(), path };
    });

    // Create a new swagger object with filtered paths
    const filteredSwagger = {
      ...swagger,
      paths: {},
      components: swagger.components ? { ...swagger.components } : undefined
    };

    // Set to track referenced schemas
    const referencedSchemas = new Set<string>();
    
    // Helper function to recursively find schema references
    const findSchemaReferences = (obj: unknown): void => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach(item => findSchemaReferences(item));
        } else {
          const objRecord = obj as Record<string, unknown>;
          Object.keys(objRecord).forEach(key => {
            if (key === '$ref' && typeof objRecord[key] === 'string') {
              // Extract schema name from reference like "#/components/schemas/Pet"
              const ref = objRecord[key] as string;
              if (ref.startsWith('#/components/schemas/')) {
                const schemaName = ref.replace('#/components/schemas/', '');
                referencedSchemas.add(schemaName);
              }
            } else {
              findSchemaReferences(objRecord[key]);
            }
          });
        }
      }
    };

    // Filter paths based on specifications and collect schema references
    specs.forEach(({ method, path }) => {
      if (swagger.paths && swagger.paths[path] && swagger.paths[path][method]) {
        if (!filteredSwagger.paths[path]) {
          filteredSwagger.paths[path] = {};
        }
        const methodDef = swagger.paths[path][method];
        filteredSwagger.paths[path][method] = methodDef;
        
        // Find all schema references in this method
        findSchemaReferences(methodDef);
      }
    });

    // Recursively resolve schema dependencies
    const resolveSchemasDependencies = () => {
      const initialSize = referencedSchemas.size;
      
      referencedSchemas.forEach(schemaName => {
        if (swagger.components?.schemas?.[schemaName]) {
          findSchemaReferences(swagger.components.schemas[schemaName]);
        }
      });
      
      // If we found new references, run again
      if (referencedSchemas.size > initialSize) {
        resolveSchemasDependencies();
      }
    };

    // Resolve all schema dependencies
    resolveSchemasDependencies();

    // Filter components to only include referenced schemas
    if (filteredSwagger.components && swagger.components?.schemas) {
      filteredSwagger.components.schemas = {};
      referencedSchemas.forEach(schemaName => {
        if (swagger.components.schemas[schemaName]) {
          filteredSwagger.components.schemas[schemaName] = swagger.components.schemas[schemaName];
        }
      });
      
      // Remove components section if no schemas are referenced
      if (Object.keys(filteredSwagger.components.schemas).length === 0) {
        delete filteredSwagger.components.schemas;
        if (Object.keys(filteredSwagger.components).length === 0) {
          delete filteredSwagger.components;
        }
      }
    }

    return JSON.stringify(filteredSwagger, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to process Swagger JSON'}`;
  }
};

const SwaggerPage = () => {
  const [swaggerInput, setSwaggerInput] = useState('');
  const [methodSpecs, setMethodSpecs] = useState('');
  const [extractedResult, setExtractedResult] = useState('');
  const [extractedSpec, setExtractedSpec] = useState<object | null>(null);
  const [inputError, setInputError] = useState('');
  const [isValidJson, setIsValidJson] = useState(false);

  // Handle swagger input changes with validation
  const handleSwaggerInputChange = (value: string) => {
    setSwaggerInput(value);
    
    // Clear previous errors
    setInputError('');
    setIsValidJson(false);
    
    if (!value.trim()) {
      return;
    }
    
    // Validate JSON syntax
    try {
      const parsed = JSON.parse(value);
      
      // Basic swagger validation
      if (!parsed.openapi && !parsed.swagger) {
        setInputError('Warning: This doesn\'t appear to be a valid OpenAPI/Swagger document (missing openapi or swagger field)');
      } else if (!parsed.paths) {
        setInputError('Warning: No paths found in the Swagger document');
      } else {
        setIsValidJson(true);
        setInputError('');
        
        // Auto-process if method specs are also provided
        if (methodSpecs.trim()) {
          setTimeout(() => {
            processSwagger(value); // Pass the current value directly
          }, 500); // Small delay to avoid excessive processing
        }
      }
    } catch (error) {
      setInputError(`Invalid JSON: ${error instanceof Error ? error.message : 'Syntax error'}`);
    }
  };

  const processSwagger = (currentSwaggerInput?: string) => {
    // Use the passed value or the current state
    const inputToUse = currentSwaggerInput || swaggerInput;
    
    console.log('Processing swagger');
    console.log('Swagger input:', inputToUse);
    console.log('Method specs:', methodSpecs);
    
    if (!inputToUse.trim()) {
      setExtractedResult('Error: Please provide Swagger JSON input');
      setExtractedSpec(null);
      return;
    }
    
    if (!methodSpecs.trim()) {
      setExtractedResult('Error: Please specify methods to extract (e.g., "put:/pet,get:/user/{username}")');
      setExtractedSpec(null);
      return;
    }

    const result = extractSwaggerMethods(inputToUse, methodSpecs);
    setExtractedResult(result);
    
    // Try to parse the result for the SwaggerUI component
    try {
      const parsedSpec = JSON.parse(result);
      setExtractedSpec(parsedSpec);
    } catch (error) {
      console.error('Failed to parse extracted result:', error);
      setExtractedSpec(null);
    }
    
    console.log('Extraction result:', result);
  };

  const handleGenerate = () => {
    processSwagger();
  };

  return (
    <div className="h-screen">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={50} minSize={30}>
          <div className="h-full p-4 space-y-4 overflow-auto">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Swagger JSON Input
              </label>
              <textarea
                className={`w-full p-2 border rounded-lg resize-vertical ${
                  inputError ? 'border-red-300 bg-red-50' : 
                  isValidJson ? 'border-green-300 bg-green-50' : 
                  'border-gray-300'
                }`}
                style={{ height: '200px' }}
                value={swaggerInput}
                onChange={(e) => handleSwaggerInputChange(e.target.value)}
                placeholder="Paste your complete Swagger/OpenAPI JSON here..."
              />
              {inputError && (
                <p className="text-sm text-red-600">{inputError}</p>
              )}
              {isValidJson && !inputError && (
                <p className="text-sm text-green-600">✓ Valid Swagger/OpenAPI JSON detected</p>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Methods to Extract
              </label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-lg"
                value={methodSpecs}
                onChange={(e) => setMethodSpecs(e.target.value)}
                placeholder="e.g., put:/pet,get:/pet/findByStatus,post:/pet/{petId}/uploadImage or * for all methods"
              />
              <p className="text-xs text-gray-500">
                Format: method:path separated by commas, or use &quot;*&quot; to extract all methods
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Extracted Swagger JSON
              </label>
              <textarea
                className="w-full p-2 border border-gray-300 rounded-lg resize-vertical"
                style={{ height: '200px' }}
                value={extractedResult}
                onChange={(e) => setExtractedResult(e.target.value)}
                placeholder="Filtered Swagger JSON will appear here..."
                readOnly
              />
            </div>
            
            <button
              className="w-full p-2 bg-black text-white rounded-lg hover:bg-gray-800 hover:shadow-lg transition-all duration-200 cursor-pointer"
              onClick={handleGenerate}
            >
              Extract Methods
            </button>
          </div>
        </Panel>
        
        <PanelResizeHandle className="w-2 bg-gray-200 hover:bg-gray-300 cursor-col-resize flex items-center justify-center">
          <div className="w-1 h-4 bg-gray-400 rounded-full"></div>
        </PanelResizeHandle>
        
        <Panel defaultSize={50} minSize={30}>
          <div className="h-full p-4 overflow-auto">
            <div className="text-lg font-bold mb-4">Swagger Preview</div>
            {extractedSpec ? (
              <SwaggerWrapper spec={extractedSpec} />
            ) : extractedResult ? (
              <div className="text-red-500 bg-red-50 p-3 rounded-lg">
                {extractedResult}
              </div>
            ) : (
              <div className="text-gray-500">
                Extract methods to see Swagger preview here
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default SwaggerPage; 