import type { ParsePragmaResult } from "./types.ts";

export function parsePragma(
	documentText: string,
	maxHeaderLines: number,
	pragmaTag: string,
	defaultRoot: string,
): ParsePragmaResult {
	const lines = documentText.split(/\r?\n/u).slice(0, Math.max(1, maxHeaderLines));

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const tagIndex = line.indexOf(pragmaTag);
		if (tagIndex < 0) {
			continue;
		}

		const schemaMatch = new RegExp(`${escapeRegExp(pragmaTag)}\\s+(\\S+)`, "u").exec(line);
		if (!schemaMatch) {
			return {
				error: {
					code: "TSI001",
					message: `Invalid pragma. Expected: ${pragmaTag} <schemaPath> [@root <identifier>]`,
					line: lineIndex,
					startCharacter: tagIndex,
					endCharacter: line.length,
				},
			};
		}

		const schemaPath = schemaMatch[1];
		if (isInvalidSchemaPathToken(schemaPath)) {
			return {
				error: {
					code: "TSI001",
					message: `Invalid pragma. Expected: ${pragmaTag} <schemaPath> [@root <identifier>]`,
					line: lineIndex,
					startCharacter: tagIndex,
					endCharacter: line.length,
				},
			};
		}
		const rootMatch = /@root\s+([^\s]+)/u.exec(line);
		const rootVariable = rootMatch?.[1] ?? defaultRoot;

		return {
			pragma: {
				schemaPath,
				rootVariable,
				line: lineIndex,
				startCharacter: tagIndex,
				endCharacter: line.length,
			},
		};
	}

	return {};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isInvalidSchemaPathToken(value: string): boolean {
	return value.startsWith("@") || value === "-->" || value === "#}" || value === "%>";
}
