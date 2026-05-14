import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { SchemaPathModel } from "../../src/core/pathModel.ts";
import { SchemaLoader } from "../../src/core/schemaLoader.ts";
import { parsePragma } from "../../src/core/pragmaParser.ts";

const templatePath = fileURLToPath(new URL("../../example/template.eta", import.meta.url));
const schemaPath = fileURLToPath(new URL("../../example/arc.schema.json", import.meta.url));

test("schema loader resolves local $defs and external file refs", async () => {
	const templateText = await readFile(templatePath, "utf8");
	const pragma = parsePragma(templateText, 30, "@schema", "$").pragma;
	assert.ok(pragma);

	const loader = new SchemaLoader();
	const loadedSchema = await loader.loadFromTemplate(templatePath, pragma.schemaPath);
	const model = SchemaPathModel.fromLoadedSchema(pragma.rootVariable, loadedSchema);

	assert.deepEqual(
		model.getSuggestions([]).map((suggestion) => suggestion.name),
		["meta", "brand", "status_loading"],
	);
	assert.deepEqual(
		model.getSuggestions(["meta"]).map((suggestion) => suggestion.name),
		["theme_color", "title"],
	);
	assert.deepEqual(
		model.getSuggestions(["brand"]).map((suggestion) => suggestion.name),
		["logo_url"],
	);

	const hover = model.getHover(["status_loading"]);
	assert.equal(hover?.typeText, "string");
	assert.match(hover?.description ?? "", /Loading state text/u);
	assert.deepEqual(hover?.enumValues, ["idle", "loading", "complete"]);
});

test("schema reload picks up changes without recreating the process", async () => {
	const workingDirectory = await mkdtemp(join(tmpdir(), "vscode-schema-intellisense-"));
	try {
		const localSchemaPath = join(workingDirectory, "schema.json");
		await writeFile(
			localSchemaPath,
			JSON.stringify({
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: {
					meta: {
						type: "object",
						properties: {
							theme_color: { type: "string" }
						}
					}
				}
			}, null, "\t"),
		);

		const loader = new SchemaLoader();
		const initialModel = SchemaPathModel.fromLoadedSchema("$", await loader.loadFromFile(localSchemaPath));
		assert.deepEqual(initialModel.getSuggestions(["meta"]).map((suggestion) => suggestion.name), ["theme_color"]);

		await writeFile(
			localSchemaPath,
			JSON.stringify({
				$schema: "https://json-schema.org/draft/2020-12/schema",
				type: "object",
				properties: {
					meta: {
						type: "object",
						properties: {
							theme_color: { type: "string" },
							accent_color: { type: "string" }
						}
					}
				}
			}, null, "\t"),
		);

		const updatedModel = SchemaPathModel.fromLoadedSchema("$", await loader.loadFromFile(localSchemaPath));
		assert.deepEqual(
			updatedModel.getSuggestions(["meta"]).map((suggestion) => suggestion.name),
			["accent_color", "theme_color"],
		);
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
});

void schemaPath;
