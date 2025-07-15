// Expected JSON response format from the backend agent
// This documents the structure that agents should return as a JSON string

export interface AgentJsonResponse {
  // The text content to display to the user
  text: string;
  
  // Optional visualization data
  visualization?: {
    type: 'line' | 'bar' | 'pie';
    title?: string;
    insight?: string;
    data: Array<{
      name: string;
      value: number;
      [key: string]: string | number; // Allow additional properties
    }>;
    config?: Record<string, unknown>; // Optional chart configuration
  } | Array<{
    type: 'line' | 'bar' | 'pie';
    title?: string;
    insight?: string;
    data: Array<{
      name: string;
      value: number;
      [key: string]: string | number;
    }>;
    config?: Record<string, unknown>;
  }>; // Support multiple charts
}

// Example agent responses:

// Text-only response:
// {
//   "text": "I understand your request. Here's the information you need..."
// }

// Response with single chart:
// {
//   "text": "Here's your performance analysis:",
//   "visualization": {
//     "type": "line",
//     "title": "Performance Trend",
//     "insight": "Shows steady growth over time",
//     "data": [
//       {"name": "Week 1", "value": 100},
//       {"name": "Week 2", "value": 150}
//     ]
//   }
// }

// Response with multiple charts:
// {
//   "text": "Here's your comprehensive analysis:",
//   "visualization": [
//     {
//       "type": "line",
//       "title": "Trend Analysis",
//       "data": [...]
//     },
//     {
//       "type": "pie",
//       "title": "Distribution",
//       "data": [...]
//     }
//   ]
// }
