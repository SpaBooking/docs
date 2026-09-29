import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// OpenAPI 3.0 uses nullable and boolean exclusive bounds instead of draft-07.
function toJsonSchema(value, version) {
  if (Array.isArray(value)) return value.map(item => toJsonSchema(item, version));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (['example', 'examples', 'discriminator', 'xml', 'externalDocs', 'nullable'].includes(key)) continue;
    result[key] = key === '$ref'
      ? child.replace('#/components/schemas/', `${version}#/definitions/`)
      : toJsonSchema(child, version);
  }
  for (const bound of ['Minimum', 'Maximum']) {
    const exclusive = `exclusive${bound}`;
    if (typeof value[exclusive] !== 'boolean') continue;
    delete result[exclusive];
    if (value[exclusive]) {
      result[exclusive] = value[bound.toLowerCase()];
      delete result[bound.toLowerCase()];
    }
  }
  if (value.nullable) {
    if (typeof result.type === 'string') {
      result.type = [result.type, 'null'];
      if (result.enum && !result.enum.includes(null)) result.enum = [...result.enum, null];
    } else return { anyOf: [result, { type: 'null' }] };
  }
  return result;
}

function atPointer(object, pointer) {
  if (!pointer) return object;
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split('/').reduce((value, key) => {
    const decoded = key.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || !Object.hasOwn(value, decoded)) throw new Error(`Missing value at ${pointer}`);
    return value[decoded];
  }, object);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const documents = new Map();
for (const version of ['v1', 'v2']) {
  const doc = parse(readFileSync(`api/${version}/openapi.yaml`, 'utf8'));
  documents.set(version, doc);
  ajv.addSchema({ definitions: toJsonSchema(doc.components.schemas, version) }, version);
}

let checked = 0;
let parsed = 0;
let failures = 0;
function check(label, schema, value) {
  checked++;
  try {
    const validate = ajv.compile(schema);
    if (!validate(value)) throw new Error(ajv.errorsText(validate.errors, { separator: '; ' }));
  } catch (error) {
    failures++;
    console.error(`${label}: ${error.message}`);
  }
}

for (const [version, doc] of documents) {
  const resolve = value => value?.$ref ? atPointer(doc, value.$ref.slice(1)) : value;
  function visit(node, pointer) {
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'example')) {
      check(`${version}${pointer}`, { $ref: `${version}#${pointer}` }, node.example);
    }
    for (const [key, value] of Object.entries(node)) {
      if (!['example', 'examples'].includes(key)) {
        visit(value, `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`);
      }
    }
  }
  visit(doc.components.schemas, '/definitions');
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
      const operation = item[method];
      if (!operation) continue;
      const bodies = [
        ['request', resolve(operation.requestBody)],
        ...Object.entries(operation.responses ?? {}).map(([status, body]) => [status, resolve(body)]),
      ];
      for (const [kind, body] of bodies) {
        for (const media of Object.values(body?.content ?? {})) {
          const examples = Object.entries(media.examples ?? {}).map(([name, example]) => [name, resolve(example).value]);
          if (Object.hasOwn(media, 'example')) examples.push(['example', media.example]);
          for (const [name, value] of examples) {
            if (!media.schema) throw new Error(`Missing schema for ${method} ${path} ${kind}`);
            check(`${version} ${method} ${path} ${kind}/${name}`, toJsonSchema(media.schema, version), value);
          }
        }
      }
    }
  }
}

// Bind complete objects or selected parts of deliberately abridged MDX examples.
// Array order matches JSON fences in the page; a count change requires review.
const bindings = JSON.parse(readFileSync('scripts/example-schemas.json', 'utf8'));
const pages = execFileSync('git', ['ls-files', '-z', '--', '*.mdx'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const page of pages) {
  const blocks = [...readFileSync(page, 'utf8').matchAll(/^```json[^\n]*\n([\s\S]*?)^```/gm)];
  try {
    if (bindings[page] && bindings[page].length !== blocks.length) {
      throw new Error('JSON example count changed; update scripts/example-schemas.json.');
    }
    for (const [index, block] of blocks.entries()) {
      const value = JSON.parse(block[1]);
      parsed++;
      for (const binding of bindings[page]?.[index] ?? []) {
        check(`${page} JSON example ${index + 1}`, { $ref: binding.schema }, atPointer(value, binding.at ?? ''));
      }
    }
  } catch (error) {
    failures++;
    console.error(`${page}: ${error.message}`);
  }
}
for (const page of Object.keys(bindings)) {
  if (!pages.includes(page)) {
    failures++;
    console.error(`Example bindings refer to an untracked or deleted page: ${page}`);
  }
}
console.log(`Parsed ${parsed} MDX JSON examples; checked ${checked} schema examples; ${failures} failures.`);
if (failures) process.exitCode = 1;
