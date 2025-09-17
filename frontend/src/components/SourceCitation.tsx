import React from 'react';
import { SearchResult } from '../../../src/mastra/types';

interface SourceCitationProps {
  source: SearchResult;
}

const SourceCitation: React.FC<SourceCitationProps> = ({ source }) => {
  return (
    <div className="source-citation">
      <div className="source-document">{source.document} (Page {source.page})</div>
      <div className="source-content">{source.content.substring(0, 150)}...</div>
      <div className="source-similarity">Relevance: {(source.similarity * 100).toFixed(1)}%</div>
    </div>
  );
};

export default SourceCitation;