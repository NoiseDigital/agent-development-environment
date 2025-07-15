'use client';

import { useRef, useEffect } from 'react';
import { getAgentConfiguration } from '../config/agentConfig';
import ChartVisualization from './ChartVisualization';
import { ChartData } from '../types/chart';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  selectedApp?: string | null;
}

export default function MessageList({ messages, isLoading, selectedApp }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get agent configuration for display
  const agentConfig = selectedApp ? getAgentConfiguration(selectedApp) : null;

  // Function to detect and parse chart data from message content
  const parseChartData = (content: string) => {
    // Look for chart data markers in the message
    const chartMatches = content.match(/\[CHART:([\s\S]*?)\]/);
    if (!chartMatches) return null;

    try {
      return JSON.parse(chartMatches[1]);
    } catch (error) {
      console.error('Error parsing chart data:', error);
      return null;
    }
  };

  // Function to remove chart data markers from display text
  const cleanMessageContent = (content: string) => {
    return content.replace(/\[CHART:[\s\S]*?\]/, '').trim();
  };

  // Function to simulate chart data for demo purposes
  const getExampleChartData = (messageContent: string): ChartData | null => {
    const lowerContent = messageContent.toLowerCase();
    
    // Check for trend/time-based queries first (most specific)
    if (lowerContent.includes('trend') || lowerContent.includes('over time') || lowerContent.includes('performance trend')) {
      return {
        type: 'line',
        title: 'Media Performance Trend',
        insight: 'Performance shows a steady upward trend with a significant spike in week 4, indicating successful campaign optimization.',
        data: [
          { name: 'Week 1', value: 2400 },
          { name: 'Week 2', value: 1398 },
          { name: 'Week 3', value: 9800 },
          { name: 'Week 4', value: 3908 },
          { name: 'Week 5', value: 4800 },
          { name: 'Week 6', value: 3800 }
        ]
      };
    }
    
    // Check for distribution/share queries
    if (lowerContent.includes('distribution') || lowerContent.includes('share') || lowerContent.includes('audience')) {
      return {
        type: 'pie',
        title: 'Audience Distribution',
        insight: 'Mobile users dominate our audience at 45%, followed by desktop users. Tablet usage remains minimal.',
        data: [
          { name: 'Mobile', value: 45 },
          { name: 'Desktop', value: 35 },
          { name: 'Tablet', value: 8 },
          { name: 'Smart TV', value: 12 }
        ]
      };
    }
    
    // Check for comparison/breakdown queries (less specific, so checked last)
    if (lowerContent.includes('compare') || lowerContent.includes('breakdown') || lowerContent.includes('categories')) {
      return {
        type: 'bar',
        title: 'Media Channel Performance',
        insight: 'Social media and video content are the top performers, while display ads show lower engagement rates.',
        data: [
          { name: 'Social Media', value: 4000 },
          { name: 'Video Content', value: 3000 },
          { name: 'Blog Posts', value: 2000 },
          { name: 'Email', value: 2780 },
          { name: 'Display Ads', value: 1890 }
        ]
      };
    }
    
    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black">
      {messages.length === 0 ? (
        <div className="flex justify-center items-center h-full">
          <div className="text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                {agentConfig?.icon || (
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                )}
              </div>
              <h3 className="text-xl font-medium text-white mb-3">
                Welcome to {agentConfig?.displayName || 'Assistant'}
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                {agentConfig?.description || 'Start a conversation by typing a message below. I\'m here to help you with your tasks.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        messages.map((message) => {
          // Check for chart data in the message
          const chartData = parseChartData(message.content) || 
                           (message.author !== 'user' ? getExampleChartData(message.content) : null);
          const displayContent = chartData ? cleanMessageContent(message.content) : message.content;
          
          return (
          <div
            key={message.id}
            className={`flex ${message.author === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-xs lg:max-w-md ${
              message.author === 'user'
                ? 'px-4 py-3 rounded-2xl shadow-sm bg-zinc-900 text-white border border-zinc-800'
                : 'space-y-0'
            }`}>
              {message.author !== 'user' && (
                <div className="px-4 py-3 rounded-2xl shadow-sm bg-zinc-800 text-white border border-zinc-700">
                  <p className="whitespace-pre-wrap leading-relaxed">{displayContent}</p>
                  <p className="text-xs mt-2 text-zinc-500">
                    {formatTimestamp(message.timestamp)}
                  </p>
                </div>
              )}
              
              {message.author === 'user' && (
                <>
                  <p className="whitespace-pre-wrap leading-relaxed">{displayContent}</p>
                  <p className="text-xs mt-2 text-zinc-400">
                    {formatTimestamp(message.timestamp)}
                  </p>
                </>
              )}
              
              {/* Render chart if present */}
              {chartData && message.author !== 'user' && (
                <ChartVisualization
                  type={chartData.type}
                  data={chartData.data}
                  title={chartData.title}
                  insight={chartData.insight}
                />
              )}
            </div>
          </div>
          );
        })
      )}
      
      {isLoading && (
        <div className="flex justify-start">
          <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700">
            <div className="flex items-center space-x-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
              <span className="text-zinc-400 text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
