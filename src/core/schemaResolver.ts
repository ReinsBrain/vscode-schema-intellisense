import type {
	JsonObject,
	JsonSchema,
	JsonValue,
	LoadedSchemaData,
	SchemaIssue,
	SchemaNode,
	SchemaResource,
} from "./types.ts";

type ResolvedSchemaReference = {
	absoluteUri: string;
	resource: SchemaResource;
	schema: JsonSchema;
};

type SchemaCandidate = {
	absoluteUri: string;
	schema: JsonSchema;
};

type ResolutionContext = {
	data: LoadedSchemaData;
	issues: SchemaIssue[];
	issueKeys: Set<string>;
	cache: Map<string, SchemaNode>;
};

export function buildRootSchemaNode(data: LoadedSchemaData): SchemaNode {
	const context: ResolutionContext = {
		data,
		issues: [...data.issues],
		issueKeys: new Set(data.issues.map((issue) => `${issue.code}:${issue.schemaPath}:${issue.message}`)),
		cache: new Map(),
	};

	const rootNode = buildSchemaNode(data.rootUri, context);
	data.issues.splice(0, data.issues.length, ...context.issues);
	return rootNode;
}

export function resolveSchemaReference(
	reference: string,
	baseUri: string,
	data: LoadedSchemaData,
	issues: SchemaIssue[] = data.issues,
): ResolvedSchemaReference | undefined {
	let absoluteUri: URL;
	try {
		absoluteUri = new URL(reference, baseUri);
	} catch {
		pushIssue(new Set(), issues, {
			code: "TSI003",
			message: `Invalid schema reference \"${reference}\".`,
			schemaPath: baseUri,
		});
		return undefined;
	}

	const resourceUri = stripHash(absoluteUri.href);
	const resource = data.resources.get(resourceUri);
	if (!resource) {
		pushIssue(new Set(), issues, {
			code: "TSI003",
			message: `Unable to resolve schema reference \"${reference}\".`,
			schemaPath: resourceUri,
		});
		return undefined;
	}

	const pointer = absoluteUri.hash;
	const resolvedSchema = resolveJsonPointer(resource.schema, pointer);
	if (resolvedSchema === undefined) {
		pushIssue(new Set(), issues, {
			code: "TSI003",
			message: `Unable to resolve schema pointer \"${pointer || "#"}\" in ${resource.filePath}.`,
			schemaPath: resource.filePath,
		});
		return undefined;
	}

	return {
		absoluteUri: resourceUri + pointer,
		resource,
		schema: resolvedSchema,
	};
}

function buildSchemaNode(reference: string, context: ResolutionContext): SchemaNode {
	const absoluteUri = new URL(reference, context.data.rootUri).href;
	const cachedNode = context.cache.get(absoluteUri);
	if (cachedNode) {
		return cachedNode;
	}

	const node = createEmptySchemaNode();
	context.cache.set(absoluteUri, node);

	const candidates = collectSchemaCandidates(absoluteUri, context, new Set());
	if (candidates.some((candidate) => candidate.schema === false)) {
		node.typeText = "never";
		return node;
	}

	const typeNames = new Set<string>();
	const propertyReferences = new Map<string, string>();
	const required = new Set<string>();
	let description: string | undefined;
	let enumValues: JsonValue[] = [];

	for (const candidate of candidates) {
		if (candidate.schema === true) {
			if (typeNames.size === 0) {
				typeNames.add("any");
			}
			continue;
		}

		if (candidate.schema === false) {
			continue;
		}

		const schema = candidate.schema;
		const localDescription = getString(schema.description) ?? getString(schema.title);
		if (localDescription) {
			description = localDescription;
		}

		const candidateEnum = getEnumValues(schema);
		if (candidateEnum.length > 0) {
			enumValues = candidateEnum;
		}

		for (const typeName of inferTypeNames(schema)) {
			typeNames.add(typeName);
		}

		for (const name of getRequiredProperties(schema)) {
			required.add(name);
		}

		for (const [propertyName, propertyReference] of getPropertyReferences(candidate.absoluteUri, schema)) {
			propertyReferences.set(propertyName, propertyReference);
		}
	}

	if (typeNames.size === 0) {
		typeNames.add(propertyReferences.size > 0 ? "object" : "any");
	}

	node.typeText = [...typeNames].sort().join(" | ");
	node.description = description;
	node.enumValues = enumValues;
	node.required = required;

	for (const propertyName of [...propertyReferences.keys()].sort((left, right) => left.localeCompare(right))) {
		const propertyReference = propertyReferences.get(propertyName);
		if (!propertyReference) {
			continue;
		}
		node.properties.set(propertyName, buildSchemaNode(propertyReference, context));
	}

	return node;
}

function collectSchemaCandidates(
	reference: string,
	context: ResolutionContext,
	trail: Set<string>,
): SchemaCandidate[] {
	if (trail.has(reference)) {
		return [];
	}

	trail.add(reference);
	const resolved = resolveReferenceWithContext(reference, context);
	if (!resolved) {
		trail.delete(reference);
		return [];
	}

	const candidates = collectCandidatesFromResolved(resolved, context, trail);
	trail.delete(reference);
	return candidates;
}

function collectCandidatesFromResolved(
	resolved: ResolvedSchemaReference,
	context: ResolutionContext,
	trail: Set<string>,
): SchemaCandidate[] {
	if (typeof resolved.schema === "boolean") {
		return [{ absoluteUri: resolved.absoluteUri, schema: resolved.schema }];
	}

	const candidates: SchemaCandidate[] = [];
	const referenceTarget = getString(resolved.schema.$ref);
	if (referenceTarget) {
		const targetAbsoluteUri = new URL(referenceTarget, resolved.absoluteUri).href;
		candidates.push(...collectSchemaCandidates(targetAbsoluteUri, context, trail));
	}

	candidates.push({
		absoluteUri: resolved.absoluteUri,
		schema: resolved.schema,
	});

	for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
		const combiners = resolved.schema[keyword];
		if (!Array.isArray(combiners)) {
			continue;
		}

		for (let index = 0; index < combiners.length; index += 1) {
			const subSchema = combiners[index];
			if (!isJsonSchema(subSchema)) {
				continue;
			}
			const childReference = toChildReference(resolved.absoluteUri, keyword, String(index));
			candidates.push(...collectSchemaCandidates(childReference, context, trail));
		}
	}

	return candidates;
}

function resolveReferenceWithContext(
	reference: string,
	context: ResolutionContext,
): ResolvedSchemaReference | undefined {
	let absoluteUri: URL;
	try {
		absoluteUri = new URL(reference, context.data.rootUri);
	} catch {
		pushIssue(context.issueKeys, context.issues, {
			code: "TSI003",
			message: `Invalid schema reference \"${reference}\".`,
			schemaPath: reference,
		});
		return undefined;
	}

	const resourceUri = stripHash(absoluteUri.href);
	const resource = context.data.resources.get(resourceUri);
	if (!resource) {
		pushIssue(context.issueKeys, context.issues, {
			code: "TSI003",
			message: `Unable to resolve schema reference \"${reference}\".`,
			schemaPath: resourceUri,
		});
		return undefined;
	}

	const pointer = absoluteUri.hash;
	const resolvedSchema = resolveJsonPointer(resource.schema, pointer);
	if (resolvedSchema === undefined) {
		pushIssue(context.issueKeys, context.issues, {
			code: "TSI003",
			message: `Unable to resolve schema pointer \"${pointer || "#"}\" in ${resource.filePath}.`,
			schemaPath: resource.filePath,
		});
		return undefined;
	}

	return {
		absoluteUri: resourceUri + pointer,
		resource,
		schema: resolvedSchema,
	};
}

function getPropertyReferences(reference: string, schema: JsonObject): Map<string, string> {
	const propertyReferences = new Map<string, string>();
	const properties = isJsonObject(schema.properties) ? schema.properties : undefined;
	if (!properties) {
		return propertyReferences;
	}

	for (const [propertyName, propertySchema] of Object.entries(properties)) {
		if (!isJsonSchema(propertySchema)) {
			continue;
		}
		propertyReferences.set(propertyName, toChildReference(reference, "properties", propertyName));
	}

	return propertyReferences;
}

function getRequiredProperties(schema: JsonObject): string[] {
	if (!Array.isArray(schema.required)) {
		return [];
	}

	return schema.required.filter((value): value is string => typeof value === "string");
}

function getEnumValues(schema: JsonObject): JsonValue[] {
	if (Array.isArray(schema.enum)) {
		return schema.enum.filter(isJsonValue);
	}

	if (isJsonValue(schema.const)) {
		return [schema.const];
	}

	return [];
}

function inferTypeNames(schema: JsonObject): string[] {
	const explicitType = schema.type;
	if (typeof explicitType === "string") {
		return [explicitType];
	}

	if (Array.isArray(explicitType)) {
		return explicitType.filter((value): value is string => typeof value === "string");
	}

	if (isJsonObject(schema.properties)) {
		return ["object"];
	}

	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		return [...new Set(schema.enum.map(inferTypeFromValue))];
	}

	return [];
}

function inferTypeFromValue(value: JsonValue): string {
	if (value === null) {
		return "null";
	}

	if (Array.isArray(value)) {
		return "array";
	}

	return typeof value;
}

function resolveJsonPointer(schema: JsonSchema, pointer: string): JsonSchema | undefined {
	if (!pointer || pointer === "#") {
		return schema;
	}

	if (!pointer.startsWith("#/")) {
		return undefined;
	}

	const tokens = pointer
		.slice(2)
		.split("/")
		.map(decodeJsonPointerToken);

	let current: unknown = schema;
	for (const token of tokens) {
		if (typeof current === "boolean") {
			return undefined;
		}

		if (Array.isArray(current)) {
			const index = Number(token);
			current = Number.isInteger(index) ? current[index] : undefined;
		} else if (isJsonObject(current)) {
			current = current[token];
		} else {
			return undefined;
		}

		if (current === undefined) {
			return undefined;
		}
	}

	return isJsonSchema(current) ? current : undefined;
}

function toChildReference(reference: string, ...tokens: string[]): string {
	const [resourceUri, pointer = ""] = reference.split("#", 2);
	const existingTokens = pointer.startsWith("/")
		? pointer.slice(1).split("/").filter((token) => token.length > 0).map(decodeJsonPointerToken)
		: [];
	const nextTokens = [...existingTokens, ...tokens];
	return `${resourceUri}#/${nextTokens.map(encodeJsonPointerToken).join("/")}`;
}

function stripHash(uri: string): string {
	const hashIndex = uri.indexOf("#");
	return hashIndex >= 0 ? uri.slice(0, hashIndex) : uri;
}

function decodeJsonPointerToken(token: string): string {
	return token.replace(/~1/gu, "/").replace(/~0/gu, "~");
}

function encodeJsonPointerToken(token: string): string {
	return token.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isJsonSchema(value: unknown): value is JsonSchema {
	return typeof value === "boolean" || isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}

	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return true;
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (!isJsonObject(value)) {
		return false;
	}

	return Object.values(value).every(isJsonValue);
}

function createEmptySchemaNode(): SchemaNode {
	return {
		typeText: "any",
		description: undefined,
		enumValues: [],
		properties: new Map(),
		required: new Set(),
	};
}

function pushIssue(issueKeys: Set<string>, issues: SchemaIssue[], issue: SchemaIssue): void {
	const key = `${issue.code}:${issue.schemaPath}:${issue.message}`;
	if (issueKeys.has(key)) {
		return;
	}

	issueKeys.add(key);
	issues.push(issue);
}
