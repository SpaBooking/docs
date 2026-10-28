// Convert OpenAPI 3.0 Schema Objects for the JSON Schema validator. Nullable
// changes the type; it does not override an enum that intentionally omits null.
export function toJsonSchema(value, version) {
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
    if (typeof result.type === 'string') result.type = [result.type, 'null'];
    else return { anyOf: [result, { type: 'null' }] };
  }
  return result;
}
