'use client';

import { useState } from 'react';
import { Session } from '../lib/adk-api';

interface MessageInputProps {
  selectedApp: string | null;
  currentSession: Session | null;
  isLoading: boolean;
  onSendMessage: (message: string) => Promise<void>;
}

export default function MessageInput({ 
  selectedApp, 
  currentSession, 
  isLoading, 
  onSendMessage 
}: MessageInputProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [showExamples, setShowExamples] = useState(false);

  // Get agent-specific example prompts
  const getExamplePrompts = (agentName: string | null): string[] => {
    if (!agentName) return [];
    
    // Return agent-specific examples based on the agent type
    switch (agentName) {
      case 'media_performance_agent': // Media Analyst
        return [
          "Show me the performance trend over time",
          "What's the sales distribution across campaigns?",
          "Compare platform performance",
        ];
      
      case 'timesheet_agent': // Timesheet Agent
        return [
          "Help me fill out my timesheet for this week",
          "Show me my time tracking summary",
          "Submit my completed timesheet"
        ];
      
      default:
        // Generic examples for unknown agents
        return [
          "What can you help me with?",
          "Show me an overview of available features",
          "Help me get started"
        ];
    }
  };

  const examplePrompts = getExamplePrompts(selectedApp);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !selectedApp || !currentSession) return;
    
    await onSendMessage(inputMessage);
    setInputMessage('');
    setShowExamples(false);
  };

  const handleExampleClick = (example: string) => {
    setInputMessage(example);
    setShowExamples(false);
  };

  return (
    <div className="border-t border-zinc-800 p-6 bg-black">
      {/* Example prompts */}
      {selectedApp && currentSession && !isLoading && examplePrompts.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            💡 Try example questions {showExamples ? '▼' : '▶'}
          </button>
          
          {showExamples && (
            <div className="mt-2 space-y-2">
              {examplePrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleExampleClick(prompt)}
                  className="block w-full text-left p-2 text-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex space-x-3">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={selectedApp && currentSession ? "Type your message..." : "Select an agent and create a session first..."}
          disabled={isLoading || !selectedApp || !currentSession}
          className="flex-1 px-4 py-3 border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-700 bg-zinc-900 text-white placeholder-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        />
        <button
          type="submit"
          disabled={isLoading || !inputMessage.trim() || !selectedApp || !currentSession}
          className="px-6 py-3 bg-zinc-900 text-white rounded-2xl hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-800 transition-all duration-200 font-medium"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
