export interface DocumentChunk {
  id: string;
  content: string;
  document: string;
  page: number;
  embedding: number[];
}

export interface SearchResult {
  id: string;
  content: string;
  document: string;
  page: number;
  similarity: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  sources: SearchResult[];
}

export interface ProcessedDocument {
  name: string;
  chunks: number;
  status: 'processed' | 'error';
}