import { readFile } from 'node:fs/promises';
import { GraphDocumentSchema } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { byJson, id, term } from '../../test/support/graph-helpers';
import { createReactPlugins } from '../plugin';

const PATH = 'src/Exports.tsx';

async function parseExports() {
  const parser = createParser(createReactPlugins());
  const bytes = await readFile(new URL('../../test/fixtures/Exports.tsx', import.meta.url));
  return parser.parseFile({ path: PATH, bytes });
}

describe('extractReact — Slice 1 export completion', () => {
  it('records every locally-defined export under its precise exported name', async () => {
    const { exports } = await parseExports();

    expect(byJson([...exports])).toEqual(
      byJson([
        {
          exporterFileId: id(PATH),
          exportedName: 'Widget',
          symbolId: id(PATH, term('Widget')),
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exportedName: 'helper',
          symbolId: id(PATH, term('helper')),
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exportedName: 'renamedInternal',
          symbolId: id(PATH, term('internal')),
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exportedName: 'default',
          symbolId: id(PATH, term('Widget')),
          typeOnly: false,
        },
      ]),
    );
  });

  it('emits a deterministic exports edge for each local export, default subKind-tagged', async () => {
    const { document } = await parseExports();
    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);

    const exportEdges = document.edges
      .filter((edge) => edge.kind === 'exports')
      .map((edge) => ({
        targetId: edge.targetId,
        rule: edge.provenance.rule,
        subKind: edge.subKind,
        resolution: edge.resolution,
      }));

    expect(byJson(exportEdges)).toEqual(
      byJson([
        {
          targetId: id(PATH, term('Widget')),
          rule: 'react/exports-local',
          subKind: undefined,
          resolution: 'deterministic',
        },
        {
          targetId: id(PATH, term('helper')),
          rule: 'react/exports-local',
          subKind: undefined,
          resolution: 'deterministic',
        },
        {
          targetId: id(PATH, term('internal')),
          rule: 'react/exports-local',
          subKind: undefined,
          resolution: 'deterministic',
        },
        {
          targetId: id(PATH, term('Widget')),
          rule: 'react/exports-default',
          subKind: 'ts:defaultExport',
          resolution: 'deterministic',
        },
      ]),
    );
  });

  it('hands every re-export to the resolver as a structured record (no fabricated edge)', async () => {
    const { reExports } = await parseExports();

    expect(byJson([...reExports])).toEqual(
      byJson([
        {
          exporterFileId: id(PATH),
          exporterPath: PATH,
          specifier: './Thing',
          kind: 'named',
          bindings: [{ name: 'Thing', exportedAs: 'Thing', typeOnly: false }],
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exporterPath: PATH,
          specifier: './greek',
          kind: 'named',
          bindings: [{ name: 'Alpha', exportedAs: 'Beta', typeOnly: false }],
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exporterPath: PATH,
          specifier: './all',
          kind: 'star',
          bindings: [],
          typeOnly: false,
        },
        {
          exporterFileId: id(PATH),
          exporterPath: PATH,
          specifier: './utils',
          kind: 'namespace',
          bindings: [{ name: '*', exportedAs: 'utils', typeOnly: false }],
          typeOnly: false,
        },
      ]),
    );
  });
});
