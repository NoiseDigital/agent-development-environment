'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';

export default function Home() {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    availableApps,
    selectedApp,
    setSelectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    error,
    sendMessage,
    createNewSession,
    selectSession,
  } = useChat();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || !selectedApp || !currentSession) return;
    
    await sendMessage(inputMessage);
    setInputMessage('');
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Media Analyst Chat
          </h1>
          
          {/* App Selection */}
          {isLoadingApps ? (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Loading available agents...
              </div>
            </div>
          ) : availableApps.length > 0 ? (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select Agent:
              </label>
              <select
                value={selectedApp || ''}
                onChange={(e) => setSelectedApp(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose an agent...</option>
                {availableApps.map((app) => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800 rounded text-yellow-700 dark:text-yellow-400 text-sm">
              No agents available. Make sure your ADK server is running.
            </div>
          )}
          
          {selectedApp && (
            <button
              onClick={createNewSession}
              className="mt-2 w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={!selectedApp}
            >
              + New Chat with {selectedApp}
            </button>
          )}
        </div>
        
        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            {sessions.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                No chat sessions yet
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    currentSession?.id === session.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Session {session.id.split('-').pop()}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {session.events.length} messages
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {new Date(session.lastUpdateTime).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            {selectedApp 
              ? `${selectedApp}${currentSession ? ` - Session ${currentSession.id.split('-').pop()}` : ''}`
              : 'Select an Agent to Start Chatting'
            }
          </h2>
          {error && (
            <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Welcome to Media Analyst
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Start a conversation by typing a message below. I&apos;m here to help you analyze media content, answer questions, and assist with your tasks.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.author === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.author === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.author === 'user'
                      ? 'text-blue-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {formatTimestamp(message.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-gray-600 dark:text-gray-400 text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={selectedApp && currentSession ? "Type your message..." : "Select an agent and create a session first..."}
              disabled={isLoading || !selectedApp || !currentSession}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim() || !selectedApp || !currentSession}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
