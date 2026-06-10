import { describe, expect, it } from 'vitest';
import {
  GRAPH_CONTROLLER_ROUTE,
  GRAPH_PROJECT_ID_PARAM,
  GRAPH_SEGMENTS,
  graphApiPath,
} from './graph-routes';

describe('graph routes (ADR-0022 project-scoped)', () => {
  it('mounts the controller under the project-scoped base', () => {
    expect(GRAPH_CONTROLLER_ROUTE).toBe('projects/:projectId/graph');
    expect(GRAPH_PROJECT_ID_PARAM).toBe('projectId');
  });

  it('builds a project-scoped client path for a segment', () => {
    expect(graphApiPath('p123', GRAPH_SEGMENTS.MAP)).toBe('/v1/projects/p123/graph/map');
    expect(graphApiPath('p123', GRAPH_SEGMENTS.BLAST_RADIUS)).toBe(
      '/v1/projects/p123/graph/blast-radius',
    );
  });

  it('url-encodes the project id', () => {
    expect(graphApiPath('a/b', GRAPH_SEGMENTS.SEARCH)).toBe('/v1/projects/a%2Fb/graph/search');
  });

  it('maps every segment to a kebab-case value', () => {
    for (const value of Object.values(GRAPH_SEGMENTS)) {
      expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
