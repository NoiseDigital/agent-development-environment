import { describe, it, expect } from 'vitest';
import { classifyPath } from './page';

describe('classifyPath', () => {
  it('classifies static routes', () => {
    expect(classifyPath('/')).toEqual({ pageType: 'home', pageTemplate: '/' });
    expect(classifyPath('/login')).toEqual({ pageType: 'login', pageTemplate: '/login' });
    expect(classifyPath('/agents')).toEqual({ pageType: 'agents', pageTemplate: '/agents' });
    expect(classifyPath('/analyze')).toEqual({ pageType: 'analyze', pageTemplate: '/analyze' });
    expect(classifyPath('/dashboards')).toEqual({ pageType: 'dashboards', pageTemplate: '/dashboards' });
  });

  it('collapses dynamic chat segments to a template', () => {
    expect(
      classifyPath('/chat/media_performance_agent/48743d8a-4164-4fc2-aef0-c94ac7780906'),
    ).toEqual({ pageType: 'chat', pageTemplate: '/chat/:agentId/:sessionId' });
    expect(classifyPath('/chat/media_performance_agent')).toEqual({
      pageType: 'chat',
      pageTemplate: '/chat/:agentId',
    });
  });

  it('groups every session id under ONE template (the cardinality win)', () => {
    const a = classifyPath('/chat/agent/00000000-0000-0000-0000-000000000001');
    const b = classifyPath('/chat/agent/ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(a.pageTemplate).toBe(b.pageTemplate);
    expect(a.pageType).toBe('chat');
  });

  it('classifies dashboards / plan / settings dynamics', () => {
    expect(classifyPath('/dashboards/abc')).toEqual({
      pageType: 'dashboard',
      pageTemplate: '/dashboards/:dashboardId',
    });
    expect(classifyPath('/plan/ACME/cmp_1')).toEqual({
      pageType: 'plan',
      pageTemplate: '/plan/:clientCode/:campaignId',
    });
    expect(classifyPath('/plan/ACME')).toEqual({ pageType: 'plan', pageTemplate: '/plan/:clientCode' });
    expect(classifyPath('/plan')).toEqual({ pageType: 'plan', pageTemplate: '/plan' });
    expect(classifyPath('/settings/users')).toEqual({
      pageType: 'settings',
      pageTemplate: '/settings/:section',
    });
  });

  it('does not misclassify a static index as its dynamic child', () => {
    expect(classifyPath('/dashboards').pageTemplate).toBe('/dashboards');
    expect(classifyPath('/agents').pageType).toBe('agents');
  });

  it('normalizes a trailing slash', () => {
    expect(classifyPath('/agents/')).toEqual({ pageType: 'agents', pageTemplate: '/agents' });
    expect(classifyPath('/')).toEqual({ pageType: 'home', pageTemplate: '/' });
  });

  it('falls back to "other" for unknown routes', () => {
    expect(classifyPath('/totally/unknown')).toEqual({
      pageType: 'other',
      pageTemplate: '/totally/unknown',
    });
  });
});
