import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { JsonObject, JsonSchema, LoadedSchemaData, SchemaIssue, SchemaResource } from "./types.ts";

export class SchemaLoader {
	async loadFromTemplate(templateFilePath: string, schemaPath: string): Promise<LoadedSchemaData> {
		const rootFilePath = resolve(dirname(templateFilePath), schemaPath);
		return this.loadFromFile(rootFilePath);
	}

	async loadFromFile(rootFilePath: string): Promise<LoadedSchemaData> {
		const normalizedRootFilePath = resolve(rootFilePath);
		const resources = new Map<string, SchemaResource>();
		const issues: SchemaIssue[] = [];
		const issueKeys = new Set<string>();

		await this.#loadRecursive(normalizedRootFilePath, resources, issues, issueKeys, new Set());
		this.#validateWithAjv(normalizedRootFilePath, resources, issues, issueKeys);

		return {
			rootFilePath: normalizedRootFilePath,
			rootUri: pathToFileURL(normalizedRootFilePath).href,
			resources,
			issues,
		};
	}

	async #loadRecursive(
		filePath: string,
		resources: Map<string, SchemaResource>,
		issues: SchemaIssue[],
		issueKeys: Set<string>,
		loadingPaths: Set<string>,
	): Promise<void> {
		const normalizedFilePath = resolve(filePath);
		const resourceUri = pathToFileURL(normalizedFilePath).href;
		if (resources.has(resourceUri) || loadingPaths.has(normalizedFilePath)) {
			return;
		}

		loadingPaths.add(normalizedFilePath);

		let parsedSchema: JsonSchema | undefined;
		try {
			const rawText = await readFile(normalizedFilePath, "utf8");
			const parsedValue: unknown = JSON.parse(rawText);
			if (!isJsonSchema(parsedValue)) {
				pushIssue(issueKeys, issues, {
					code: "TSI002",
					message: "Schema root must be a JSON object or boolean.",
					schemaPath: normalizedFilePath,
				});
				return;
			}
			parsedSchema = parsedValue;
		} catch (error) {
			pushIssue(issueKeys, issues, {
				code: "TSI002",
				message: getReadableLoadError(error),
				schemaPath: normalizedFilePath,
			});
			return;
		} finally {
			loadingPaths.delete(normalizedFilePath);
		}

		resources.set(resourceUri, {
			filePath: normalizedFilePath,
			uri: resourceUri,
			schema: parsedSchema,
		});

		for (const reference of collectSchemaReferences(parsedSchema)) {
			const resolvedReference = resolveReference(reference, resourceUri);
			if (!resolvedReference) {
				pushIssue(issueKeys, issues, {
					code: "TSI003",
					message: `Unsupported schema reference \"${reference}\". Only local file and in-document references are supported in the MVP.`,
					schemaPath: normalizedFilePath,
				});
				continue;
			}

			if (resolvedReference.resourceUri === resourceUri) {
				continue;
			}

			await this.#loadRecursive(fileURLToPath(resolvedReference.resourceUri), resources, issues, issueKeys, loadingPaths);
		}
	}

	#validateWithAjv(
		rootFilePath: string,
		resources: Map<string, SchemaResource>,
		issues: SchemaIssue[],
		issueKeys: Set<string>,
	): void {
		if (resources.size === 0) {
			return;
		}

		const ajv = new Ajv2020({
			allErrors: true,
			strict: false,
			validateSchema: false,
		});

		try {
			for (const resource of resources.values()) {
				ajv.addSchema(resource.schema, resource.uri);
			}

			const rootUri = pathToFileURL(rootFilePath).href;
			ajv.compile({ $ref: rootUri });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const code = /ref|reference|pointer/iu.test(message) ? "TSI003" : "TSI002";
			pushIssue(issueKeys, issues, {
				code,
				message: message.startsWith("schema") ? message : `Schema compilation failed: ${message}`,
				schemaPath: rootFilePath,
			});
		}
	}
}

function collectSchemaReferences(schema: JsonSchema): string[] {
	const references: string[] = [];
	const seenNodes = new Set<JsonObject>();

	visitSchema(schema, (candidate) => {
		if (seenNodes.has(candidate)) {
			return;
		}
		seenNodes.add(candidate);
		const reference = candidate.$ref;
		if (typeof reference === "string") {
			references.push(reference);
		}
	});

	return references;
}

function visitSchema(schema: JsonSchema, visitor: (schema: JsonObject) => void): void {
	if (typeof schema === "boolean") {
		return;
	}

	visitor(schema);
	for (const value of Object.values(schema)) {
		if (isJsonSchema(value)) {
			visitSchema(value, visitor);
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				if (isJsonSchema(item)) {
					visitSchema(item, visitor);
				}
			}
		}
	}
}

function resolveReference(reference: string, baseUri: string): { resourceUri: string } | undefined {
	try {
		const absoluteUri = new URL(reference, baseUri);
		if (absoluteUri.protocol !== "file:") {
			return undefined;
		}
		absoluteUri.hash = "";
		return { resourceUri: absoluteUri.href };
	} catch {
		return undefined;
	}
}

function getReadableLoadError(error: unknown): string {
	if (error instanceof SyntaxError) {
		return `Schema file contains invalid JSON: ${error.message}`;
	}

	if (error instanceof Error) {
		return `Unable to read schema file: ${error.message}`;
	}

	return "Unable to read schema file.";
}

function isJsonSchema(value: unknown): value is JsonSchema {
	return typeof value === "boolean" || isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issueKeys: Set<string>, issues: SchemaIssue[], issue: SchemaIssue): void {
	const key = `${issue.code}:${issue.schemaPath}:${issue.message}`;
	if (issueKeys.has(key)) {
		return;
	}

	issueKeys.add(key);
	issues.push(issue);
}
