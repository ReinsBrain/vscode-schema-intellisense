import { buildRootSchemaNode } from "./schemaResolver.ts";
import type { CompletionSuggestion, HoverResult, LoadedSchemaData, ResolvePathResult, SchemaNode } from "./types.ts";

export class SchemaPathModel {
	static fromLoadedSchema(rootVariable: string, loadedSchema: LoadedSchemaData): SchemaPathModel {
		return new SchemaPathModel(rootVariable, buildRootSchemaNode(loadedSchema));
	}

	readonly #rootVariable: string;
	readonly #rootNode: SchemaNode;

	constructor(rootVariable: string, rootNode: SchemaNode) {
		this.#rootVariable = rootVariable;
		this.#rootNode = rootNode;
	}

	resolve(segments: string[]): ResolvePathResult {
		let currentNode = this.#rootNode;

		for (let index = 0; index < segments.length; index += 1) {
			const nextNode = currentNode.properties.get(segments[index]);
			if (!nextNode) {
				return {
					node: currentNode,
					invalidSegmentIndex: index,
				};
			}
			currentNode = nextNode;
		}

		return { node: currentNode };
	}

	getSuggestions(segments: string[], partialSegment = ""): CompletionSuggestion[] {
		const resolution = this.resolve(segments);
		if (!resolution.node || resolution.invalidSegmentIndex !== undefined) {
			return [];
		}

		const normalizedPartialSegment = partialSegment.toLowerCase();
		return [...resolution.node.properties.entries()]
			.filter(([name]) => name.toLowerCase().startsWith(normalizedPartialSegment))
			.map(([name, node]) => ({
				name,
				node,
				required: resolution.node?.required.has(name) ?? false,
			}))
			.sort((left, right) => {
				if (left.required !== right.required) {
					return left.required ? -1 : 1;
				}
				return left.name.localeCompare(right.name);
			});
	}

	getHover(segments: string[]): HoverResult | undefined {
		const resolution = this.resolve(segments);
		if (!resolution.node || resolution.invalidSegmentIndex !== undefined) {
			return undefined;
		}

		return {
			path: formatPath(this.#rootVariable, segments),
			typeText: resolution.node.typeText,
			description: resolution.node.description,
			enumValues: resolution.node.enumValues,
		};
	}
}

function formatPath(rootVariable: string, segments: string[]): string {
	return segments.length === 0 ? rootVariable : `${rootVariable}.${segments.join(".")}`;
}
