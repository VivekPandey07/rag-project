import { VectorSearchTool } from '../tools/vector-search';
import { SearchResult, ChatMessage } from '../types';
import { OpenAI } from 'openai';

export class RAGAgent {
  private openai: OpenAI;
  private vectorSearch: VectorSearchTool;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.vectorSearch = new VectorSearchTool();
  }

  async generateResponse(userMessage: string, conversationHistory: ChatMessage[] = []): Promise<{ response: string, sources: SearchResult[] }> {
    // Use OpenAI directly for embedding
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userMessage
    });

    // Search for relevant document chunks
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const relevantChunks = await this.vectorSearch.searchSimilarChunks(queryEmbedding, 5);

    // Build context from relevant chunks
    const context = relevantChunks.map((chunk: any) =>
      `From ${chunk.document}, page ${chunk.page}:\n${chunk.content}`
    ).join('\n\n');

    // Build conversation history
    const messages: any[] = [
      {
        role: "system",
        content: `You are a knowledgeable financial analyst specializing in Warren Buffett's investment philosophy and Berkshire Hathaway's business strategy. Your expertise comes from analyzing years of Berkshire Hathaway annual shareholder letters.

Core Responsibilities:
- Answer questions about Warren Buffett's investment principles and philosophy
- Provide insights into Berkshire Hathaway's business strategies and decisions
- Reference specific examples from the shareholder letters when appropriate
- Maintain context across conversations for follow-up questions

Guidelines:
- Always ground your responses in the provided shareholder letter content
- Quote directly from the letters when relevant, with proper citations
- If information isn't available in the documents, clearly state this limitation
- Provide year-specific context when discussing how views or strategies evolved
- For numerical data or specific acquisitions, cite the exact source letter and year
- Explain complex financial concepts in accessible terms while maintaining accuracy

Response Format:
- Provide comprehensive, well-structured answers
- Include relevant quotes from the letters with year attribution
- List source documents used for your response
- For follow-up questions, reference previous conversation context appropriately

Remember: Your authority comes from the shareholder letters. Stay grounded in this source material and be transparent about the scope and limitations of your knowledge.`
      }
    ];

    // Add conversation history
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    // Add current query with context
    messages.push({
      role: "user",
      content: `Context from Berkshire Hathaway shareholder letters:\n${context}\n\nQuestion: ${userMessage}`
    });

    // Use OpenAI directly for chat completion
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
      stream: true
    });

    let response = "";
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      response += content;
    }

    return {
      response,
      sources: relevantChunks
    };
  }
}