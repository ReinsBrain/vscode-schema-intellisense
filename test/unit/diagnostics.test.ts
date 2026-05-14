import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { SchemaPathModel } from "../../src/core/pathModel.ts";
import { SchemaLoader } from "../../src/core/schemaLoader.ts";
import { getPathDiagnostics } from "../../src/core/templateIntellisense.ts";
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

test("diagnostics flag invalid property chains", async () => {
	const model = await loadModel();
	const text = "<%= $.meta.not_a_real_key %>";
	const diagnostics = getPathDiagnostics(text, "$", model);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, "TSI004");
	assert.match(diagnostics[0].message, /Unknown property path/u);
	assert.ok(diagnostics[0].startOffset < diagnostics[0].endOffset);
});

test("diagnostics flag invalid bracket notation chains", async () => {
	const model = await loadModel();
	const text = "<%= $.meta[\"not_a_real_key\"] %>";
	const diagnostics = getPathDiagnostics(text, "$", model);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, "TSI004");
	assert.match(diagnostics[0].message, /Unknown property path/u);
	assert.ok(diagnostics[0].startOffset < diagnostics[0].endOffset);
	assert.equal(text.slice(diagnostics[0].startOffset, diagnostics[0].startOffset + "not_a_real_key".length), "not_a_real_key");
});
