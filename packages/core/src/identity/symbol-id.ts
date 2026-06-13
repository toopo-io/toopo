import { z } from 'zod';
import { type Descriptor, DescriptorSchema } from './descriptor.js';
import { type PackageCoordinate, PackageCoordinateSchema } from './package-coordinate.js';

/**
 * Stable logical identity of a symbol (ADR-0015 §4) — a SCIP-style descriptor
 * path, never line/column. Two representations, losslessly inter-derivable:
 *
 *   - structured `SymbolIdentity` — manipulated by the parser/resolver.
 *   - encoded `SymbolId` string — the canonical storage key (ADR-0017 §5).
 *
 * Encoding (documented in the package README):
 *   - local symbol:    `<descriptor>+`
 *   - external symbol: `<manager> ' ' <name> ' ' <descriptor>+`
 *
 * where each descriptor is `name<suffixChar>` (with method/parameter/
 * type-parameter bracket forms), names are SCIP-escaped (backtick-wrapped,
 * doubled backticks), and spaces inside the package coordinate are escaped as
 * a double space. A local id therefore contains no top-level single space;
 * an external id contains exactly two — making the two forms unambiguous.
 */
export const SymbolIdentitySchema = z
  .object({
    package: PackageCoordinateSchema.optional(),
    descriptors: z.array(DescriptorSchema).min(1),
  })
  .strict();
export type SymbolIdentity = z.infer<typeof SymbolIdentitySchema>;

/** The encoded, canonical string form — used as the storage key. */
export type SymbolId = string;

const SIMPLE_IDENTIFIER = /^[A-Za-z0-9_+\-$]+$/;

function isSimpleChar(c: string): boolean {
  return SIMPLE_IDENTIFIER.test(c);
}

function encodeName(name: string): string {
  if (SIMPLE_IDENTIFIER.test(name)) {
    return name;
  }
  return `\`${name.replaceAll('`', '``')}\``;
}

function encodeDescriptor(d: Descriptor): string {
  const name = encodeName(d.name);
  switch (d.suffix) {
    case 'namespace':
      return `${name}/`;
    case 'type':
      return `${name}#`;
    case 'term':
      return `${name}.`;
    case 'meta':
      return `${name}:`;
    case 'macro':
      return `${name}!`;
    case 'method':
      return `${name}(${d.disambiguator ?? ''}).`;
    case 'type-parameter':
      return `[${name}]`;
    case 'parameter':
      return `(${name})`;
    case 'local':
      return `${name}~${d.disambiguator ?? ''}~`;
  }
}

function encodePackageField(value: string): string {
  return value.replaceAll(' ', '  ');
}

/** Encode a structured identity to its canonical `SymbolId`; throws on a malformed identity. */
export function formatSymbolId(identity: SymbolIdentity): SymbolId {
  const parsed = SymbolIdentitySchema.parse(identity);
  const path = parsed.descriptors.map(encodeDescriptor).join('');
  if (parsed.package) {
    const manager = encodePackageField(parsed.package.manager);
    const name = encodePackageField(parsed.package.name);
    return `${manager} ${name} ${path}`;
  }
  return path;
}

interface NameRead {
  readonly name: string;
  readonly next: number;
}

function readName(source: string, start: number): NameRead {
  if (source.charAt(start) === '`') {
    let cursor = start + 1;
    let name = '';
    while (cursor < source.length) {
      if (source.charAt(cursor) === '`') {
        if (source.charAt(cursor + 1) === '`') {
          name += '`';
          cursor += 2;
          continue;
        }
        return { name, next: cursor + 1 };
      }
      name += source.charAt(cursor);
      cursor += 1;
    }
    throw new Error(`Unterminated escaped identifier in symbol id: ${source}`);
  }

  let cursor = start;
  let name = '';
  while (cursor < source.length && isSimpleChar(source.charAt(cursor))) {
    name += source.charAt(cursor);
    cursor += 1;
  }
  if (name.length === 0) {
    throw new Error(`Expected an identifier at index ${start} in symbol id: ${source}`);
  }
  return { name, next: cursor };
}

const SIMPLE_SUFFIXES: Readonly<Record<string, Descriptor['suffix'] | undefined>> = {
  '/': 'namespace',
  '#': 'type',
  '.': 'term',
  ':': 'meta',
  '!': 'macro',
};

function parseDescriptorPath(path: string): Descriptor[] {
  const descriptors: Descriptor[] = [];
  let cursor = 0;

  while (cursor < path.length) {
    const lead = path.charAt(cursor);

    if (lead === '(') {
      const { name, next } = readName(path, cursor + 1);
      if (path.charAt(next) !== ')') {
        throw new Error(`Unterminated parameter descriptor in symbol id: ${path}`);
      }
      descriptors.push({ name, suffix: 'parameter' });
      cursor = next + 1;
      continue;
    }

    if (lead === '[') {
      const { name, next } = readName(path, cursor + 1);
      if (path.charAt(next) !== ']') {
        throw new Error(`Unterminated type-parameter descriptor in symbol id: ${path}`);
      }
      descriptors.push({ name, suffix: 'type-parameter' });
      cursor = next + 1;
      continue;
    }

    const { name, next } = readName(path, cursor);
    const suffix = path.charAt(next);

    if (suffix === '(') {
      let scan = next + 1;
      let disambiguator = '';
      while (scan < path.length && path.charAt(scan) !== ')') {
        disambiguator += path.charAt(scan);
        scan += 1;
      }
      if (path.charAt(scan) !== ')' || path.charAt(scan + 1) !== '.') {
        throw new Error(`Malformed method descriptor in symbol id: ${path}`);
      }
      descriptors.push(
        disambiguator.length > 0
          ? { name, suffix: 'method', disambiguator }
          : { name, suffix: 'method' },
      );
      cursor = scan + 2;
      continue;
    }

    if (suffix === '~') {
      let scan = next + 1;
      let disambiguator = '';
      while (scan < path.length && path.charAt(scan) !== '~') {
        disambiguator += path.charAt(scan);
        scan += 1;
      }
      if (path.charAt(scan) !== '~') {
        throw new Error(`Unterminated local descriptor in symbol id: ${path}`);
      }
      descriptors.push(
        disambiguator.length > 0
          ? { name, suffix: 'local', disambiguator }
          : { name, suffix: 'local' },
      );
      cursor = scan + 1;
      continue;
    }

    const simpleSuffix = SIMPLE_SUFFIXES[suffix];
    if (simpleSuffix === undefined) {
      throw new Error(`Unknown descriptor suffix '${suffix}' in symbol id: ${path}`);
    }
    descriptors.push({ name, suffix: simpleSuffix });
    cursor = next + 1;
  }

  if (descriptors.length === 0) {
    throw new Error(`Empty descriptor path in symbol id: ${path}`);
  }
  return descriptors;
}

function splitTopLevelSegments(id: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inBacktick = false;
  let cursor = 0;

  while (cursor < id.length) {
    const c = id.charAt(cursor);
    if (c === '`') {
      inBacktick = !inBacktick;
      current += c;
      cursor += 1;
      continue;
    }
    if (c === ' ' && !inBacktick) {
      if (id.charAt(cursor + 1) === ' ') {
        current += ' ';
        cursor += 2;
        continue;
      }
      segments.push(current);
      current = '';
      cursor += 1;
      continue;
    }
    current += c;
    cursor += 1;
  }
  segments.push(current);
  return segments;
}

/** Parse a canonical `SymbolId` back to its structured identity; throws on an empty or malformed id. */
export function parseSymbolId(id: SymbolId): SymbolIdentity {
  if (id.length === 0) {
    throw new Error('Cannot parse an empty symbol id');
  }
  const segments = splitTopLevelSegments(id);

  if (segments.length === 1) {
    const [path] = segments;
    return SymbolIdentitySchema.parse({ descriptors: parseDescriptorPath(path ?? '') });
  }

  if (segments.length === 3) {
    const [manager, name, path] = segments;
    const coordinate: PackageCoordinate = { manager: manager ?? '', name: name ?? '' };
    return SymbolIdentitySchema.parse({
      package: coordinate,
      descriptors: parseDescriptorPath(path ?? ''),
    });
  }

  throw new Error(`Malformed symbol id (expected a local or external form): ${id}`);
}
