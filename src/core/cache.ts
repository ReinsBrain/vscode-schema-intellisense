import { resolve } from "node:path";

import * as vscode from "vscode";

import { SchemaLoader } from "./schemaLoader.ts";
import { SchemaPathModel } from "./pathModel.ts";
import { getSettings, isSupportedLanguage } from "./settings.ts";
import { parsePragma } from "./pragmaParser.ts";
import { getPathDiagnostics } from "./templateIntellisense.ts";
import type { AnalyzerDiagnostic, ParsePragmaResult, SchemaIssue } from "./types.ts";

type DocumentAnalysis = {
	rootVariable: string;
	pragmaResult: ParsePragmaResult;
	pathModel?: SchemaPathModel;
	schemaIssues: SchemaIssue[];
	pathDiagnostics: AnalyzerDiagnostic[];
	dependencyPaths: string[];
};

type CachedDocumentAnalysis = {
	version: number;
	analysis: DocumentAnalysis;
};

export class TemplateAnalysisCache {
	readonly #schemaLoader = new SchemaLoader();
	readonly #entries = new Map<string, CachedDocumentAnalysis>();

	async getAnalysis(document: vscode.TextDocument): Promise<DocumentAnalysis> {
		const settings = getSettings();
		const cacheKey = document.uri.toString();
		const cachedEntry = this.#entries.get(cacheKey);
		if (cachedEntry && cachedEntry.version === document.version) {
			return cachedEntry.analysis;
		}

		const analysis = await this.#buildAnalysis(document, settings);
		this.#entries.set(cacheKey, {
			version: document.version,
			analysis,
		});
		return analysis;
	}

	invalidateDocument(documentUri: vscode.Uri): void {
		this.#entries.delete(documentUri.toString());
	}

	invalidateBySchemaPath(schemaPath: string): vscode.Uri[] {
		const normalizedSchemaPath = resolve(schemaPath);
		const affectedDocumentUris: vscode.Uri[] = [];
		for (const [cacheKey, entry] of this.#entries.entries()) {
			if (!entry.analysis.dependencyPaths.includes(normalizedSchemaPath)) {
				continue;
			}
			this.#entries.delete(cacheKey);
			affectedDocumentUris.push(vscode.Uri.parse(cacheKey));
		}

		return affectedDocumentUris;
	}

	clear(): void {
		this.#entries.clear();
	}

	async #buildAnalysis(
		document: vscode.TextDocument,
		settings = getSettings(),
	): Promise<DocumentAnalysis> {
		if (!settings.enabled || !isSupportedLanguage(document.languageId, settings)) {
			return {
				rootVariable: settings.defaultRoot,
				pragmaResult: {},
				schemaIssues: [],
				pathDiagnostics: [],
				dependencyPaths: [],
			};
		}

		const documentFilePath = getDocumentFilePath(document);
		const pragmaResult = parsePragma(document.getText(), settings.maxHeaderLines, settings.pragmaTag, settings.defaultRoot);
		const rootVariable = pragmaResult.pragma?.rootVariable ?? settings.defaultRoot;
		if (!documentFilePath || !pragmaResult.pragma) {
			return {
				rootVariable,
				pragmaResult,
				schemaIssues: [],
				pathDiagnostics: [],
				dependencyPaths: [],
			};
		}

		const loadedSchema = await this.#schemaLoader.loadFromTemplate(documentFilePath, pragmaResult.pragma.schemaPath);
		const pathModel = SchemaPathModel.fromLoadedSchema(rootVariable, loadedSchema);
		return {
			rootVariable,
			pragmaResult,
			pathModel,
			schemaIssues: loadedSchema.issues,
			pathDiagnostics: getPathDiagnostics(document.getText(), rootVariable, pathModel),
			dependencyPaths: [...loadedSchema.resources.values()].map((resource) => resolve(resource.filePath)),
		};
	}
}

export function getDocumentFilePath(document: vscode.TextDocument): string | undefined {
	return document.uri.scheme === "file" ? document.uri.fsPath : undefined;
}

export type { DocumentAnalysis };
