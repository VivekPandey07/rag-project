import React, { useState, useRef, useEffect } from 'react';
import Message from './Message';
import SourceCitation from './SourceCitation';
import { ChatMessage, SearchResult } from '../../../src/mastra/types';

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedDocuments, setProcessedDocuments] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchProcessedDocuments();
  }, []);

  const fetchProcessedDocuments = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/processed-documents');
      if (response.ok) {
        const data = await response.json();
        setProcessedDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error fetching processed documents:', error);
    }
  };

  const processDocuments = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/process-documents', {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        setProcessedDocuments(data.results.map((r: any) => r.name));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Processed ${data.results.length} documents with ${data.results.reduce((acc: number, r: any) => acc + r.chunks, 0)} total chunks.`
        }]);
      } else {
        throw new Error('Failed to process documents');
      }
    } catch (error) {
      console.error('Error processing documents:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to process documents. Please check if documents are placed in the documents folder.'
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input.trim(),
          conversationHistory: messages
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      let assistantMessage = '';
      let sources: SearchResult[] = [];

      // Read the stream
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.chunk) {
                    assistantMessage += data.chunk;
                    // Update UI with the new content
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.role === 'assistant') {
                        lastMessage.content = assistantMessage;
                      } else {
                        newMessages.push({ role: 'assistant', content: assistantMessage });
                      }
                      return newMessages;
                    });
                  }
                  if (data.done) {
                    sources = data.sources || [];
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error reading stream:', error);
        } finally {
          setIsLoading(false);
          
          // Add sources to the final message
          if (sources.length > 0) {
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.sources = sources;
              }
              return newMessages;
            });
          }
        }
      };

      processStream();

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.'
      }]);
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Berkshire Hathaway Intelligence</h2>
        <div className="document-status">
          <span>Processed Documents: {processedDocuments.length}</span>
          <button 
            onClick={processDocuments} 
            disabled={isProcessing}
            className="process-btn"
          >
            {isProcessing ? 'Processing...' : 'Process Documents'}
          </button>
        </div>
      </div>
      
      <div className="messages">
        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Warren Buffett's investment philosophy..."
          disabled={isLoading || processedDocuments.length === 0}
        />
        <button type="submit" disabled={isLoading || !input.trim() || processedDocuments.length === 0}>
          Send
        </button>
      </form>
      
      {processedDocuments.length === 0 && (
        <div className="no-documents-warning">
          <p>No documents processed yet. Please add PDF files to the documents folder and click "Process Documents".</p>
        </div>
      )}
    </div>
  );
};

export default Chat;