import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import type { Collection, FileSummary, SourceItem } from './types.js';

export class InputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function fingerprint(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}
// Only the observed uncompressed canonical-EJSON NDJSON layout is accepted.
// Each line is bounded; records are decoded one at a time without loading raw files.
export async function readCollection(
  path: string,
  collection: Collection,
  visit: (item: SourceItem) => void,
): Promise<FileSummary> {
  const info = await stat(path);
  if (!info.isFile())
    throw new InputError('INPUT_NOT_FILE', 'Expected a regular NDJSON file.');
  const hash = createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let buffer = '',
    line = 0,
    recordsRead = 0,
    blankLines = 0,
    bytes = 0,
    first = true;
  const consume = (text: string) => {
    line++;
    if (!text.trim()) {
      blankLines++;
      return;
    }
    recordsRead++;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      visit({
        line,
        raw: null,
        parseError: 'Invalid JSON document; contents omitted.',
      });
      return;
    }
    visit({ line, raw, parseError: null });
  };
  try {
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk as Buffer);
      bytes += (chunk as Buffer).length;
      const text = decoder.decode(chunk as Buffer, { stream: true });
      if (first && text.length) {
        first = false;
        if (text.startsWith('\uFEFF'))
          throw new InputError(
            'INPUT_BOM',
            'UTF-8 BOM is not accepted by the canonical package.',
          );
      }
      buffer += text;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        if (newline > 1024 * 1024)
          throw new InputError(
            'INPUT_LINE_LIMIT',
            'A document exceeds the 1 MiB line limit.',
          );
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > 1024 * 1024)
        throw new InputError(
          'INPUT_LINE_LIMIT',
          'A document exceeds the 1 MiB line limit.',
        );
    }
    buffer += decoder.decode();
    if (buffer.length) consume(buffer);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      'INPUT_READ_FAILED',
      'Cannot read valid UTF-8 NDJSON; check access and encoding.',
    );
  }
  return {
    collection,
    filename: `${collection}.ndjson`,
    bytes,
    sha256: hash.digest('hex'),
    recordsRead,
    blankLines,
  };
}
