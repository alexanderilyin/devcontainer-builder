import fs from 'node:fs';
import path from 'node:path';
import { DataTable } from '@cucumber/cucumber';
import { World } from '../world.js';
import { RestEndpoint } from './rest_endpoint.js';
import { substituteCapturedValues } from './capture.js';

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyBytes: Buffer;
}

// TYPE|KEY|VALUE rows -> a real fetch(). HEADER/QUERY are self-explanatory;
// FIELD is one field of a JSON body, assembled into an object here rather
// than accepted as a single raw-JSON cell - kept field-by-field like every
// other table in this project (PROPERTY|VALUE, OPTION|VALUE always being
// one real value per row, never a blob crammed into one cell). BODY is an
// escape hatch (VALUE = a literal JSON string) for a body too nested for
// flat FIELD rows to express. FORM/FILE build a real multipart body -
// FORM is a plain text field, FILE's VALUE is a path to a real fixture
// file, read from disk and uploaded under its own basename. BODY/FIELD
// rows/FORM+FILE rows are three mutually exclusive ways to build one
// request body - a table combining more than one of them is rejected.
//
// `table` is optional - a request with no headers/query/body needs no
// table at all (see the no-`with:` step variant in http.step.ts).
export async function sendHttpRequest(world: World, endpoint: RestEndpoint, method: string, rawPath: string, table?: DataTable): Promise<void> {
  const requestPath = substituteCapturedValues(world, rawPath);
  const url = new URL(requestPath, endpoint.baseUrl);
  const headers: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const formParts: { type: 'FORM' | 'FILE'; key: string; value: string }[] = [];
  let rawBody: string | undefined;

  for (const { TYPE, KEY, VALUE } of table ? table.hashes() : []) {
    const value = substituteCapturedValues(world, VALUE);
    if (TYPE === 'HEADER') {
      headers[KEY] = value;
    } else if (TYPE === 'QUERY') {
      url.searchParams.append(KEY, value);
    } else if (TYPE === 'FIELD') {
      fields[KEY] = value;
    } else if (TYPE === 'BODY') {
      rawBody = value;
    } else if (TYPE === 'FORM' || TYPE === 'FILE') {
      formParts.push({ type: TYPE, key: KEY, value });
    } else {
      throw new Error(`Unknown request TYPE "${TYPE}" (known types: HEADER, QUERY, FIELD, BODY, FORM, FILE)`);
    }
  }

  const hasFields = Object.keys(fields).length > 0;
  const hasMultipart = formParts.length > 0;
  if ([rawBody !== undefined, hasFields, hasMultipart].filter(Boolean).length > 1) {
    throw new Error('Request table cannot mix BODY, FIELD, and FORM/FILE rows - use exactly one way to build the body');
  }

  let body: string | FormData | undefined;
  if (hasMultipart) {
    const formData = new FormData();
    for (const part of formParts) {
      if (part.type === 'FORM') {
        formData.append(part.key, part.value);
      } else {
        const buffer = fs.readFileSync(part.value);
        formData.append(part.key, new Blob([buffer]), path.basename(part.value));
      }
    }
    body = formData;
  } else if (rawBody !== undefined) {
    body = rawBody;
  } else if (hasFields) {
    body = JSON.stringify(fields);
  }

  // A FormData body must NOT get an explicit Content-Type - fetch sets
  // the correct `multipart/form-data; boundary=...` value itself, and
  // setting it manually here would omit the boundary and break parsing.
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
  if (body !== undefined && !hasMultipart && !hasContentType) {
    headers['Content-Type'] = 'application/json';
  }

  // `redirect: 'manual'` deliberately - a 3xx (needed later for the
  // OAuth2 authorization-code flow's redirect) is directly observable as
  // a status + Location header, not silently auto-followed.
  const res = await fetch(url, { method, headers, body, redirect: 'manual' });
  const bytes = Buffer.from(await res.arrayBuffer());
  world.lastHttpResponse = {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: bytes.toString('utf8'),
    bodyBytes: bytes,
  };
  // Dual-bookkeeping: also populate lastCommandResult so the existing,
  // unmodified "the command result data has:" step keeps working for
  // JSON body assertions (a JSON body is valid YAML, so yaml.load +
  // JMESPath round-trips it with zero new code). Status/header
  // assertions get their own purpose-built Then steps in http.step.ts
  // instead of overloading "the command exited with {int}", which would
  // read misleadingly for an HTTP call.
  world.lastCommandResult = { EXIT_CODE: String(res.status), STDOUT: bytes.toString('utf8'), STDERR: '' };
}
