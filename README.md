# VS Code Schema IntelliSense

JSON-Schema-driven IntelliSense for template variables inside Eta templates.

This extension reads a file-header pragma such as:

`<!-- @schema ./arc.schema.json @root $ -->`

and uses the referenced JSON Schema to provide:

- autocomplete for dot-path chains such as `$.meta.`
- hover details for paths such as `$.status_loading`
- diagnostics for invalid property chains such as `$.meta.not_a_real_key`
- live updates when the template or referenced schema files change

## MVP scope

Current support intentionally stays focused:

- Eta expressions: `<%= ... %>`, `<%- ... %>`, and `<% ... %>`
- local schema files only
- local `$ref` and `$defs`
- dot notation and quoted bracket notation
- graceful failure on unsupported syntax

## Pragma usage

Add a schema pragma near the top of the template file:

`<!-- @schema ./arc.schema.json @root $ -->`

Supported fields:

- `@schema <path>` — required
- `@root <identifier>` — optional, defaults to `$`

The schema path resolves relative to the template file.

## Example

See the `example/` folder:

- `example/template.eta`
- `example/arc.schema.json`
- `example/brand.schema.json`

Expected behavior:

- typing `$.` shows top-level keys such as `meta`, `brand`, and `status_loading`
- typing `$.meta.` shows nested keys such as `theme_color` and `title`
- bracket notation such as `$.meta["theme_color"]` and `$['meta']` resolves too
- hovering `$.status_loading` shows type, description, and enum values
- invalid paths produce diagnostics
- editing `arc.schema.json` or `brand.schema.json` updates results without restarting VS Code

## Settings

The extension contributes these settings:

- `templateSchemaIntellisense.enabled`
- `templateSchemaIntellisense.languageIds`
- `templateSchemaIntellisense.maxHeaderLines`
- `templateSchemaIntellisense.pragmaTag`
- `templateSchemaIntellisense.defaultRoot`

## Development

Requirements:

- Node.js v24+
- VS Code

Install dependencies:

`npm install`

Run tests:

`npm run test:unit`

Build the extension:

`npm run build`

Launch in an Extension Development Host:

1. Open this folder in VS Code.
2. Run the `Run Extension` launch/debug action.
3. Open `example/template.eta` in the Extension Development Host.

## Architecture

Core modules:

- `src/core/pragmaParser.ts`
- `src/core/schemaLoader.ts`
- `src/core/schemaResolver.ts`
- `src/core/pathModel.ts`
- `src/core/templateContextExtractor.ts`
- `src/core/templateIntellisense.ts`
- `src/core/cache.ts`

VS Code adapters:

- `src/providers/completionProvider.ts`
- `src/providers/hoverProvider.ts`
- `src/providers/diagnosticsProvider.ts`
- `src/extension.ts`

## Test coverage

The native Node test suite covers:

- pragma parsing
- local `$ref` and `$defs` resolution
- completion suggestions
- hover payloads
- invalid-path diagnostics
- schema reload behavior

## Known limitations

- bracket notation only supports static quoted keys in the MVP
- no remote schema fetching
- no full JavaScript expression understanding inside template blocks
- no code actions yet
- diagnostics are currently template-document centered even when the underlying schema file is the source of the problem
