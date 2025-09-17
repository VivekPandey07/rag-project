import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { VectorSearchTool } from './tools/vector-search';
import { DocumentProcessingWorkflow } from './workflows/document-processing';
import { RAGAgent } from './agents/rag-agent';
import { ChatRequest } from './types';
import { Mastra } from '@mastra/core';

// Load environment variables first
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Enhanced CORS configuration for better frontend compatibility
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize services
const vectorSearch = new VectorSearchTool();
const documentProcessor = new DocumentProcessingWorkflow();
const ragAgent = new RAGAgent();

// Initialize database with better error handling
async function initializeServices() {
  try {
    await vectorSearch.initializeDatabase();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    // Don't exit the process, but log the error
  }
}

// Health check endpoint (moved up for better accessibility)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: port,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get processed documents endpoint with enhanced error handling
app.get('/api/processed-documents', async (req, res) => {
  try {
    console.log('📄 Fetching processed documents...');
    
    // Check if vectorSearch is properly initialized
    if (!vectorSearch) {
      return res.status(500).json({ 
        error: 'Vector search service not initialized',
        details: 'The vector search tool failed to initialize properly'
      });
    }

    const documents = await vectorSearch.getProcessedDocuments();
    console.log(`📄 Found ${documents?.length || 0} processed documents`);
    
    res.json({ 
      documents: documents || [],
      count: documents?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching processed documents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch processed documents',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Process documents endpoint
app.post('/api/process-documents', async (req, res) => {
  try {
    console.log('🔄 Starting document processing...');
    const documentsDir = path.join(__dirname, 'documents');
    
    // Check if documents directory exists
    const fs = require('fs');
    if (!fs.existsSync(documentsDir)) {
      return res.status(400).json({ 
        error: 'Documents directory not found',
        path: documentsDir 
      });
    }

    const results = await documentProcessor.processAllDocuments(documentsDir);
    console.log('✅ Document processing completed');
    
    res.json({
      message: 'Document processing completed',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error processing documents:', error);
    res.status(500).json({ 
      error: 'Failed to process documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Chat endpoint with proper error handling
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] }: ChatRequest = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request: message is required and must be a string' 
      });
    }

    console.log('💬 Processing chat request:', message.substring(0, 50) + '...');

    // For non-streaming response
    if (req.headers.accept !== 'text/event-stream') {
      const { response, sources } = await ragAgent.generateResponse(message, conversationHistory);
      return res.json({ 
        response, 
        sources,
        timestamp: new Date().toISOString()
      });
    }

    // For streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    // Generate response with sources
    const { response, sources } = await ragAgent.generateResponse(message, conversationHistory);

    // Send the complete response (simplified for demo)
    // In a real implementation, you would stream each token
    res.write(`data: ${JSON.stringify({ 
      chunk: response, 
      done: true, 
      sources,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    res.end();
    
  } catch (error) {
    console.error('❌ Chat error:', error);
    
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ 
        error: 'Failed to generate response',
        done: true 
      })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ 
        error: 'Failed to generate response',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Catch-all route for debugging
app.use('*', (req, res) => {
  console.log(`⚠️  Unhandled route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/processed-documents',
      'POST /api/process-documents',
      'POST /api/chat'
    ]
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('🚨 Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
async function startServer() {
  try {
    // Initialize services first
    await initializeServices();
    
    // Start the server
    const server = app.listen(port, () => {
      console.log('🚀 Server started successfully!');
      console.log(`📡 Server running on http://localhost:${port}`);
      console.log(`🏥 Health check: http://localhost:${port}/api/health`);
      console.log(`📄 Documents API: http://localhost:${port}/api/processed-documents`);
      console.log('📱 Environment:', process.env.NODE_ENV || 'development');
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Process terminated');
      });
    });

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for Mastra CLI (should be at module level)
export const mastra = new Mastra({
  telemetry: {
    enabled: false  
  }
});