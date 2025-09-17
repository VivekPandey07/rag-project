import { Pool } from 'pg';
import { DocumentChunk, SearchResult } from "../types";

export class VectorSearchTool {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async searchSimilarChunks(embedding: number[], limit: number = 5): Promise<SearchResult[]> {
    const query = `
      SELECT id, content, document, page, 1 - (embedding <=> $1) as similarity
      FROM document_chunks
      ORDER BY embedding <=> $1
      LIMIT $2
    `;

    const result = await this.pool.query(query, [`[${embedding.join(',')}]`, limit]);
    return result.rows;
  }

  async storeChunk(chunk: DocumentChunk): Promise<void> {
    const query = `
      INSERT INTO document_chunks (id, content, document, page, embedding)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding
    `;

    await this.pool.query(query, [
      chunk.id,
      chunk.content,
      chunk.document,
      chunk.page,
      `[${chunk.embedding.join(',')}]`
    ]);
  }

  async initializeDatabase(): Promise<void> {
    // Enable vector extension
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Create document_chunks table if it doesn't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        document TEXT NOT NULL,
        page INTEGER NOT NULL,
        embedding vector(1536)
      )
    `);

    // Create index for faster similarity search
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
      ON document_chunks 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
  }

  async getProcessedDocuments(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT document FROM document_chunks
    `);
    return result.rows.map(row => row.document);
  }
}