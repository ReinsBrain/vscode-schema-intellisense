import * as vscode from "vscode";

import { TemplateAnalysisCache } from "../core/cache.ts";
import { getSettings, isSupportedLanguage } from "../core/settings.ts";

export class DiagnosticsController implements vscode.Disposable {
	readonly #analysisCache: TemplateAnalysisCache;
	readonly #collection: vscode.DiagnosticCollection;

	constructor(analysisCache: TemplateAnalysisCache) {
		this.#analysisCache = analysisCache;
		this.#collection = vscode.languages.createDiagnosticCollection("templateSchemaIntellisense");
	}

	async refreshDocument(document: vscode.TextDocument): Promise<void> {
		const settings = getSettings();
		if (!settings.enabled || !isSupportedLanguage(document.languageId, settings)) {
			this.#collection.delete(document.uri);
			return;
		}

		const analysis = await this.#analysisCache.getAnalysis(document);
		const diagnostics: vscode.Diagnostic[] = [];
		const pragmaRange = getPragmaRange(document, analysis.pragmaResult);

		if (analysis.pragmaResult.error) {
			const diagnostic = new vscode.Diagnostic(
				new vscode.Range(
					new vscode.Position(analysis.pragmaResult.error.line, analysis.pragmaResult.error.startCharacter),
					new vscode.Position(analysis.pragmaResult.error.line, analysis.pragmaResult.error.endCharacter),
				),
				analysis.pragmaResult.error.message,
				vscode.DiagnosticSeverity.Error,
			);
			diagnostic.code = analysis.pragmaResult.error.code;
			diagnostics.push(diagnostic);
		}

		for (const schemaIssue of analysis.schemaIssues) {
			const diagnostic = new vscode.Diagnostic(
				pragmaRange,
				schemaIssue.message,
				vscode.DiagnosticSeverity.Error,
			);
			diagnostic.code = schemaIssue.code;
			diagnostics.push(diagnostic);
		}

		for (const pathDiagnostic of analysis.pathDiagnostics) {
			const diagnostic = new vscode.Diagnostic(
				new vscode.Range(document.positionAt(pathDiagnostic.startOffset), document.positionAt(pathDiagnostic.endOffset)),
				pathDiagnostic.message,
				vscode.DiagnosticSeverity.Warning,
			);
			diagnostic.code = pathDiagnostic.code;
			diagnostics.push(diagnostic);
		}

		this.#collection.set(document.uri, diagnostics);
	}

	delete(documentUri: vscode.Uri): void {
		this.#collection.delete(documentUri);
	}

	dispose(): void {
		this.#collection.dispose();
	}
}

function getPragmaRange(
	document: vscode.TextDocument,
	pragmaResult: { pragma?: { line: number; startCharacter: number; endCharacter: number } },
): vscode.Range {
	if (!pragmaResult.pragma) {
		return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
	}

	return new vscode.Range(
		new vscode.Position(pragmaResult.pragma.line, pragmaResult.pragma.startCharacter),
		new vscode.Position(pragmaResult.pragma.line, pragmaResult.pragma.endCharacter),
	);
}
