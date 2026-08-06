type JsonSchema = {
  type?: unknown;
  required?: unknown;
  additionalProperties?: unknown;
  properties?: unknown;
  items?: unknown;
  minLength?: unknown;
  minItems?: unknown;
  minimum?: unknown;
};

export function matchesConversationSchema(value: unknown, rawSchema: unknown): boolean {
  if (!isRecord(rawSchema)) return false;
  const schema: JsonSchema = rawSchema;
  if (schema.type === 'object') return matchesObject(value, schema);
  if (schema.type === 'array') return matchesArray(value, schema);
  if (schema.type === 'string') {
    return (
      typeof value === 'string' &&
      (typeof schema.minLength !== 'number' || value.length >= schema.minLength)
    );
  }
  if (schema.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
      && (typeof schema.minimum !== 'number' || value >= schema.minimum);
  }
  if (schema.type === 'integer') {
    return Number.isInteger(value)
      && (typeof schema.minimum !== 'number' || (value as number) >= schema.minimum);
  }
  if (schema.type === 'null') return value === null;
  return false;
}

function matchesObject(value: unknown, schema: JsonSchema): boolean {
  if (!isRecord(value) || !isRecord(schema.properties)) return false;
  const properties = schema.properties;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (!required.every((key) => typeof key === 'string' && key in value)) return false;
  if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) {
    return false;
  }
  return Object.entries(value).every(([key, item]) => {
    const propertySchema = properties[key];
    return propertySchema === undefined || matchesConversationSchema(item, propertySchema);
  });
}

function matchesArray(value: unknown, schema: JsonSchema): boolean {
  if (!Array.isArray(value)) return false;
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
  return schema.items !== undefined && value.every((item) => matchesConversationSchema(item, schema.items));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
