import React from 'react';
import SourceCitation from './SourceCitation';
import { ChatMessage } from '../../../src/mastra/types';

interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  return (
    <div className={`message ${message.role}`}>
      <div className="message-content">
        {message.content}
        {message.sources && message.sources.length > 0 && (
          <div className="sources">
            <h4>Sources:</h4>
            {message.sources.map((source, index) => (
              <SourceCitation key={index} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;