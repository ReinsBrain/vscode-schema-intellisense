Absolutely — great idea. Here’s a ready-to-paste **prompt specification markdown** you can drop into a new repo and hand to an agent.

```markdown
# Prompt Spec: VS Code Extension for Schema-Aware Template IntelliSense

## Goal

Build a Visual Studio Code extension that provides **JSON-Schema-driven autocomplete, hover docs, and validation diagnostics** inside template files (starting with Eta, expandable to Nunjucks/EJS/etc).

The extension should let users declare a schema at the top of a template file and then get editor intelligence for the configured root variable (for example `$`).

---

## Product Summary

Create a VS Code extension that:

- Reads a schema reference from a file-level pragma comment
- Resolves and parses the schema (including `$ref` and `$defs`)
- Understands template variable chains (e.g. `$.meta.theme_color`)
- Provides:
  - property autocomplete
  - hover/type info
  - diagnostics for unknown paths

---

## Scope (MVP)

### In Scope

1. **Pragma parsing**
   - Support pragma in first ~30 lines of file
   - Example:
     - HTML style: `<!-- @schema ./arc.schema.json @root $ -->`
     - JS style: `{# @schema ./arc.schema.json @root $ #}` (optional if easy)
   - Extract:
     - `schemaPath`
     - `rootVariable` (default `$`)

2. **Language/file targeting**
   - Work when `document.languageId` is `eta`
   - Also allow config-based language IDs (array setting)
   - Optional filename fallback patterns (e.g. `*.eta`, `*.njk`, `*.ejs`)

3. **Schema model**
   - Parse JSON Schema object
   - Resolve local `$ref` pointers (at least `#/$defs/...`)
   - Build navigable property tree
   - Preserve useful metadata:
     - type
     - description
     - enum
     - required/optional

4. **Completions**
   - Trigger after `.`
   - In template expression context, suggest next valid keys
   - Example:
     - input: `$.meta.`
     - suggestions: `theme_color`
   - Include detail/docs in completion items

5. **Hover**
   - Hover on property chain segment shows:
     - full path
     - inferred type
     - description (if present)
     - enum values (if present)

6. **Diagnostics**
   - Unknown property path squiggles
   - Missing/unreadable schema file diagnostic
   - Invalid pragma diagnostic

7. **Live updates**
   - Recompute on:
     - template edit
     - schema file edit
     - file switch/open

---

## Out of Scope (MVP)

- Full JavaScript expression parsing inside templates
- Remote URL schema fetching
- Full JSON Schema spec completeness
- Code actions/quick-fixes
- Multi-root inference from runtime code
- Formatting support

---

## Extension Settings

Add user/workspace settings:

- `templateSchemaIntellisense.enabled` (boolean, default `true`)
- `templateSchemaIntellisense.languageIds` (string[], default `["eta"]`)
- `templateSchemaIntellisense.maxHeaderLines` (number, default `30`)
- `templateSchemaIntellisense.pragmaTag` (string, default `@schema`)
- `templateSchemaIntellisense.defaultRoot` (string, default `$`)

---

## Pragma Format

Primary syntax (required for MVP):

- `@schema <relative-or-absolute-path>`
- `@root <identifier>` optional (defaults to `$`)

Example:

`<!-- @schema ./arc.schema.json @root $ -->`

Rules:

- First pragma match wins
- If `@root` omitted, use setting default
- Path resolves relative to current template file directory

---

## Architecture Requirements

Implement with clear module boundaries:

1. `pragmaParser`
2. `schemaLoader`
3. `schemaResolver` (local `$ref`)
4. `pathModel` (property tree + lookups)
5. `templateContextExtractor` (find `$.foo.bar` chains in Eta blocks)
6. `providers/completion`
7. `providers/hover`
8. `providers/diagnostics`
9. `cache` (schema + parsed model keyed by file URI + mtime/hash)

Keep code testable and small-function oriented.

---

## VS Code APIs To Use

- Completion item provider
- Hover provider
- Diagnostic collection
- File system watcher
- Workspace/document change events
- Document selectors

Do not use private/proposed APIs.

---

## Parsing Behavior (MVP Heuristics)

For Eta:

- Expression delimiters:
  - `<%= ... %>`
  - `<%- ... %>`
  - `<% ... %>` (optional parse for diagnostics)
- Inside expression, detect chains matching:
  - `<root>.<segment>(.<segment>)*`
- Segment pattern:
  - `[A-Za-z_$][A-Za-z0-9_$]*`
- Ignore bracket notation in MVP (`$["meta"]` unsupported)

If unsupported syntax encountered, fail gracefully without crashing.

---

## Diagnostics Behavior

Create diagnostics with stable codes/severity:

- `TSI001` invalid pragma
- `TSI002` schema not found/unreadable
- `TSI003` unresolved `$ref`
- `TSI004` unknown property path

Severity:

- Errors for schema load/parse failures
- Warnings for unknown paths (configurable later)

---

## Testing Requirements

Add automated tests for:

1. Pragma parser
2. Local `$ref` resolution
3. Path completion suggestions
4. Hover payload content
5. Unknown-path diagnostics
6. Live schema reload behavior

Also provide one manual test workspace fixture:

- `example/template.eta`
- `example/schema.json`

---

## Deliverables

1. Working VS Code extension project
2. README with:
   - install/run steps
   - pragma usage
   - supported template syntax
   - known limitations
3. CHANGELOG entry for MVP
4. Basic test suite passing
5. Example fixture demonstrating expected UX

---

## Acceptance Criteria

The task is complete when all are true:

1. In an Eta file with pragma `@schema ./arc.schema.json @root $`, typing `$.` shows top-level schema keys.
2. Typing `$.meta.` shows nested `meta` keys from schema.
3. Hover on `$.status_loading` shows schema-derived type/description.
4. Invalid chain like `$.meta.not_a_real_key` gets a diagnostic.
5. Editing schema file updates completions/diagnostics without restarting VS Code.
6. Extension handles missing schema path gracefully with clear diagnostics.

---

## Implementation Quality Bar

- TypeScript only
- Strict mode on
- No large monolithic files
- Defensive error handling
- Minimal dependencies
- Clear logs for troubleshooting (debug-level only)

---

## Suggested Execution Plan

1. Scaffold extension project
2. Implement pragma parser + unit tests
3. Implement schema loader/resolver + tests
4. Implement path model + tests
5. Implement completion provider
6. Implement hover provider
7. Implement diagnostics
8. Wire file watchers + cache invalidation
9. Add fixtures and README docs
10. Validate against acceptance criteria

---

## Nice-to-Have (If Time Permits)

- Support Nunjucks/EJS delimiters via config
- Definition provider: jump from template path to schema location
- Bracket notation support
- Optional inline completion
- Command: “Validate current template against schema now”

---

## Non-Functional Constraints

- Must not degrade editor performance on medium files
- Must avoid blocking I/O on hot paths
- Must be resilient to malformed templates/schemas
- Must never throw uncaught exceptions in providers

---

## Final Output Expected From Agent

Provide:

1. Summary of implemented features
2. File tree of created project
3. Notes on tradeoffs/limitations
4. Evidence of tests passing
5. Quickstart instructions to run extension in Extension Development Host
```
