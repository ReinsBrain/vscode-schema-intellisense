import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePragma } from "../../src/core/pragmaParser.ts";

test("parsePragma extracts schema path and root variable", () => {
	const result = parsePragma("<!-- @schema ./arc.schema.json @root $ -->\n<div></div>", 30, "@schema", "$default");
	assert.equal(result.pragma?.schemaPath, "./arc.schema.json");
	assert.equal(result.pragma?.rootVariable, "$");
});

test("parsePragma falls back to default root when @root is omitted", () => {
	const result = parsePragma("<!-- @schema ./arc.schema.json -->", 30, "@schema", "$root");
	assert.equal(result.pragma?.rootVariable, "$root");
});

test("parsePragma reports malformed pragmas", () => {
	const result = parsePragma("<!-- @schema -->", 30, "@schema", "$");
	assert.equal(result.error?.code, "TSI001");
	assert.match(result.error?.message ?? "", /Invalid pragma/u);
});
