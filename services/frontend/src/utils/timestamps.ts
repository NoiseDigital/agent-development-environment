// Utility functions for timestamp handling

// Helper function to convert ADK timestamp to JavaScript timestamp
export const normalizeTimestamp = (timestamp: number | string): number => {
  let normalizedTimestamp = timestamp;
  
  // If timestamp is a string, try to parse it
  if (typeof normalizedTimestamp === 'string') {
    normalizedTimestamp = new Date(normalizedTimestamp).getTime();
  }
  
  // If timestamp seems to be in seconds instead of milliseconds (Unix timestamp)
  if (normalizedTimestamp < 1000000000000) { // Less than year 2001 in milliseconds
    normalizedTimestamp = normalizedTimestamp * 1000;
  }
  
  // Fallback to current time if timestamp is invalid
  if (!normalizedTimestamp || isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
    console.warn('Invalid timestamp detected, using current time:', timestamp);
    normalizedTimestamp = Date.now();
  }
  
  return normalizedTimestamp;
};

// Format timestamp for display in session list
export const formatSessionDate = (timestamp: number | string): string => {
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  return new Date(normalizedTimestamp).toLocaleDateString();
};

// Format timestamp for message display
export const formatMessageTime = (timestamp: number | string): string => {
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  return new Date(normalizedTimestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};
