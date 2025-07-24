import React from 'react';

// Comprehensive agent configuration including endpoints and display info
export interface AgentConfig {
  name: string;
  displayName: string;
  description: string;
  url: string;
  icon: React.ReactElement;
}

// Complete agent configurations
export const agentConfigurations: Record<string, AgentConfig> = {
  'media_performance_agent': {
    name: 'media_performance_agent',
    displayName: 'Media Analyst',
    description: 'I\'m here to help you analyze media content, unlock performance insights, examine data trends, and assist with your media analytics tasks.',
    url: 'https://agent-media-performance-192748761045.us-central1.run.app',
    icon: React.createElement('svg', {
      className: 'w-8 h-8',
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
      key: 'media'
    }, React.createElement('path', {
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: 2,
      d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
    }))
  },
  'timesheet_agent': {
    name: 'timesheet_agent',
    displayName: 'Timesheet Assistant',
    description: 'I help you populate and submit your timesheets efficiently. Track time, categorize work, and ensure accurate timesheet completion.',
    url: 'https://agent-timesheets-192748761045.us-central1.run.app',
    icon: React.createElement('svg', {
      className: 'w-8 h-8',
      fill: 'none',
      stroke: 'currentColor',
      viewBox: '0 0 24 24',
      key: 'timesheet'
    }, React.createElement('path', {
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: 2,
      d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
    }))
  },
};

// Default icons for agents not in the configuration (using React.createElement to avoid JSX)
export const defaultIcons = [
  React.createElement('svg', {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    key: 'analytics'
  }, React.createElement('path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
  })),
  React.createElement('svg', {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    key: 'assistant'
  }, React.createElement('path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
  })),
  React.createElement('svg', {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    key: 'brain'
  }, React.createElement('path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
  })),
  React.createElement('svg', {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    key: 'document'
  }, React.createElement('path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
  })),
  React.createElement('svg', {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    key: 'code'
  }, React.createElement('path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 2,
    d: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
  }))
];


// Helper function to get agent configuration
export const getAgentConfiguration = (agentName: string): AgentConfig => {
  console.log('Looking for agent:', agentName);
  console.log('Available configurations:', Object.keys(agentConfigurations));
  
  const config = agentConfigurations[agentName];
  
  if (config) {
    console.log('Found config for:', agentName, config);
    return config;
  }
  
  console.log('No config found for:', agentName, 'using fallback');
  
  // Fallback for agents not in config
  const defaultDisplayName = agentName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Use hash to consistently assign default icon
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const defaultIcon = defaultIcons[Math.abs(hash) % defaultIcons.length];
  
  return {
    name: agentName,
    displayName: defaultDisplayName,
    description: 'AI agent specialized in various tasks',
    url: '', // No URL for unconfigured agents - will need to be added manually
    icon: defaultIcon
  };
};

// Helper function to get all configured agent URLs
export const getAgentEndpoints = (): Record<string, { name: string; url: string; description?: string }> => {
  const endpoints: Record<string, { name: string; url: string; description?: string }> = {};
  
  Object.values(agentConfigurations).forEach(config => {
    endpoints[config.name] = {
      name: config.name,
      url: config.url,
      description: config.description
    };
  });
  
  return endpoints;
};
