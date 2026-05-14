import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { SchemaPathModel } from "../../src/core/pathModel.ts";
import { SchemaLoader } from "../../src/core/schemaLoader.ts";
import { getCompletionLookup, getHoverLookup } from "../../src/core/templateIntellisense.ts";
import { parsePragma } from "../../src/core/pragmaParser.ts";

const templatePath = fileURLToPath(new URL("../../example/template.eta", import.meta.url));

async function loadModel(): Promise<SchemaPathModel> {
	const templateText = await readFile(templatePath, "utf8");
	const pragma = parsePragma(templateText, 30, "@schema", "$").pragma;
	assert.ok(pragma);
	const loader = new SchemaLoader();
	const loadedSchema = await loader.loadFromTemplate(templatePath, pragma.schemaPath);
	return SchemaPathModel.fromLoadedSchema(pragma.rootVariable, loadedSchema);
}

test("completion returns top-level keys for $.", async () => {
	const model = await loadModel();
	const text = "<%= $. %>";
	const offset = text.indexOf("$.") + "$.".length;
	const completion = getCompletionLookup(text, "$", offset, model);
	assert.deepEqual(
		completion?.suggestions.map((suggestion) => suggestion.name),
		["meta", "brand", "status_loading"],
	);
});

test("completion returns nested keys for $.meta.", async () => {
	const model = await loadModel();
	const text = "<%= $.meta. %>";
	const offset = text.indexOf("$.meta.") + "$.meta.".length;
	const completion = getCompletionLookup(text, "$", offset, model);
	assert.deepEqual(
		completion?.suggestions.map((suggestion) => suggestion.name),
		["theme_color", "title"],
	);
});

test("completion returns keys for bracket notation", async () => {
	const model = await loadModel();
	const text = "<%= $[\"me %>";
	const offset = text.indexOf("$[\"me") + "$[\"me".length;
	const completion = getCompletionLookup(text, "$", offset, model);
	assert.deepEqual(
		completion?.suggestions.map((suggestion) => suggestion.name),
		["meta"],
	);
	assert.equal(completion?.insertSuffix, '"]');
});

test("completion returns nested keys for mixed dot and bracket notation", async () => {
	const model = await loadModel();
	const text = "<%= $.meta[\"th %>";
	const offset = text.indexOf("$.meta[\"th") + "$.meta[\"th".length;
	const completion = getCompletionLookup(text, "$", offset, model);
	assert.deepEqual(
		completion?.suggestions.map((suggestion) => suggestion.name),
		["theme_color"],
	);
	assert.equal(completion?.insertSuffix, '"]');
});

test("completion returns keys for single-quoted bracket notation", async () => {
	const model = await loadModel();
	const text = "<%= $['me %>";
	const offset = text.indexOf("$['me") + "$['me".length;
	const completion = getCompletionLookup(text, "$", offset, model);
	assert.deepEqual(
		completion?.suggestions.map((suggestion) => suggestion.name),
		["meta"],
	);
	assert.equal(completion?.insertSuffix, "']");
});

test("hover returns schema-derived details for a resolved path", async () => {
	const model = await loadModel();
	const text = "<%= $.status_loading %>";
	const offset = text.indexOf("status_loading") + 2;
	const hover = getHoverLookup(text, "$", offset, model);
	assert.equal(hover?.hover.typeText, "string");
	assert.match(hover?.hover.description ?? "", /Loading state text/u);
	assert.deepEqual(hover?.hover.enumValues, ["idle", "loading", "complete"]);
});

test("hover resolves bracket notation paths", async () => {
	const model = await loadModel();
	const text = "<%= $.meta[\"theme_color\"] %>";
	const offset = text.indexOf("theme_color") + 2;
	const hover = getHoverLookup(text, "$", offset, model);
	assert.equal(hover?.hover.typeText, "string");
	assert.match(hover?.hover.description ?? "", /Hex color used/u);
});
