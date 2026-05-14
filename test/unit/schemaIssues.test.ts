import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { SchemaLoader } from "../../src/core/schemaLoader.ts";

test("schema loader reports unresolved local refs", async () => {
	const workingDirectory = await mkdtemp(join(tmpdir(), "vscode-schema-intellisense-issues-"));
	try {
		const schemaPath = join(workingDirectory, "schema.json");
		await writeFile(
			schemaPath,
			JSON.stringify({
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: {
					meta: { $ref: "#/$defs/missing" }
				}
			}, null, "\t"),
		);

		const loader = new SchemaLoader();
		const loadedSchema = await loader.loadFromFile(schemaPath);
		assert.ok(loadedSchema.issues.some((issue) => issue.code === "TSI003"));
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
});
