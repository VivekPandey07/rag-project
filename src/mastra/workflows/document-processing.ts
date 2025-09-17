import { Mastra } from '@mastra/core';
import { MDocument } from "@mastra/rag";
import { LibSQLVector } from "@mastra/libsql";
import fs from 'fs';
import path from 'path';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { VectorSearchTool } from '../tools/vector-search';
import { ProcessedDocument } from '../types';
const pdfParse = require('pdf-parse');
// Export Mastra instance as required by CLI
export const mastra = new Mastra({
  telemetry: {
    enabled: false  
  }
});
export class DocumentProcessingWorkflow {
  private mastra: Mastra;
  private vectorStore: LibSQLVector;
  private vectorSearch: VectorSearchTool;

  constructor() {
    // Use the exported Mastra instance
    this.mastra = mastra;

    // Initialize vector store (using LibSQL vector store)
    this.vectorStore = new LibSQLVector({
      connectionUrl: process.env.DATABASE_URL || 'file:./vector.db',
      authToken: process.env.TURSO_AUTH_TOKEN, // Optional, for Turso cloud
      maxRetries: 3,
      initialBackoffMs: 1000
    });

    this.vectorSearch = new VectorSearchTool();
  }

  async processDocument(filePath: string): Promise<ProcessedDocument> {
    try {
      const documentName = path.basename(filePath, '.pdf');
      
      // Read PDF file as text
      const fileBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(fileBuffer);
      
      // Create MDocument using the correct constructor format
      const mDocument = new MDocument({
        docs: [{
          text: pdfData.text,
          metadata: {
            name: documentName,
            processedAt: new Date().toISOString(),
            source: filePath,
            totalPages: pdfData.numpages
          }
        }],
        type: 'text'
      });
      
      // Process and chunk the document
      const chunks = await mDocument.chunk({
        strategy: 'markdown',
        size: 1000,
        overlap: 200
      });
      
      // Create vector index if it doesn't exist (handle potential errors)
      try {
        await this.vectorStore.createIndex({
          indexName: documentName,
          dimension: 1536
        });
      } catch (indexError: any) {
        // Index might already exist, continue if that's the case
        if (!indexError.message?.includes('already exists')) {
          throw indexError;
        }
      }
      
      // Process each chunk and create embeddings
      let processedChunks = 0;
      const embeddings: number[][] = [];
      const metadata: any[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Use AI SDK for embeddings
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: chunk.text
        });
        
        embeddings.push(embedding);
        
        // Create metadata with proper structure
        const chunkMetadata = {
          id: `${documentName}-chunk-${i}`,
          text: chunk.text,
          document: documentName,
          page: chunk.metadata?.page || 1,
          chunkIndex: i
        };
        
        metadata.push(chunkMetadata);
        
        // Store in your custom vector search tool
        const documentChunk = {
          id: `${documentName}-chunk-${i}`,
          content: chunk.text,
          document: documentName,
          page: chunk.metadata?.page || 1,
          embedding: embedding
        };
        
        await this.vectorSearch.storeChunk(documentChunk);
        processedChunks++;
      }
      
      // Store in Mastra vector store with proper structure
      const vectorIds: string[] = [];
      for (let i = 0; i < embeddings.length; i++) {
        vectorIds.push(`${documentName}-chunk-${i}`);
      }
      
      await this.vectorStore.upsert({
        indexName: documentName,
        vectors: embeddings.map((embedding, index) => ({
          id: vectorIds[index],
          vector: embedding,
          metadata: metadata[index]
        }))
      });
      
      return {
        name: documentName,
        chunks: processedChunks,
        status: 'processed'
      };
    } catch (error) {
      console.error(`Error processing document:`, error);
      return {
        name: path.basename(filePath, '.pdf'),
        chunks: 0,
        status: 'error'
      };
    }
  }

  async processAllDocuments(documentsDir: string): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];
    
    try {
      const files = fs.readdirSync(documentsDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      console.log(`Found ${pdfFiles.length} PDF files to process`);
      
      for (const file of pdfFiles) {
        const filePath = path.join(documentsDir, file);
        console.log(`Processing document: ${file}`);
        const result = await this.processDocument(filePath);
        results.push(result);
        
        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`Processed ${results.length} documents successfully`);
    } catch (error) {
      console.error('Error reading documents directory:', error);
    }
    
    return results;
  }

  // Additional method to search for similar content
  async searchSimilarContent(query: string, indexName: string, limit: number = 5) {
    try {
      // Create embedding for the query
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: query
      });

      // Search in vector store
      const results = await this.vectorStore.query({
        indexName: indexName,
        queryVector: embedding,
        topK: limit,
        includeVector: false,
        minScore: 0.0
      });

      return results;
    } catch (error) {
      console.error('Error searching similar content:', error);
      return [];
    }
  }

  // Method to list all available indexes
  async listIndexes(): Promise<string[]> {
    try {
      return await this.vectorStore.listIndexes();
    } catch (error) {
      console.error('Error listing indexes:', error);
      return [];
    }
  }

  // Method to get index statistics
  async getIndexStats(indexName: string) {
    try {
      return await this.vectorStore.describeIndex({ indexName });
    } catch (error) {
      console.error(`Error getting stats for index ${indexName}:`, error);
      return null;
    }
  }
}