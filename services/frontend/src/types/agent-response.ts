// JSON response format agents return (as a string) to the chat UI.

import type { ChartData } from './chart';

export interface AgentJsonResponse {
  // Text content to display to the user.
  text: string;
  // Optional visualization(s) — a single chart/heatmap or several.
  visualization?: ChartData | ChartData[];
}

// Example — chart response:
// { "text": "Here's the trend:", "visualization": { "type": "line", "title": "...",
//   "data": [{ "name": "W1", "value": 100 }] } }
//
// Example — heatmap response:
// { "text": "Spend correlates strongly with brand lift.", "visualization": {
//   "type": "heatmap", "title": "Correlation", "rows": ["spend"], "cols": ["brand_lift"],
//   "matrix": [[0.98]], "significant": [[true]] } }
