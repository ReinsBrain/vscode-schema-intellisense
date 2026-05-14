import * as vscode from "vscode";

import { TemplateAnalysisCache } from "./core/cache.ts";
import { getSettings, isSupportedLanguage } from "./core/settings.ts";
import { TemplateCompletionProvider } from "./providers/completionProvider.ts";
import { DiagnosticsController } from "./providers/diagnosticsProvider.ts";
import { TemplateHoverProvider } from "./providers/hoverProvider.ts";

export function activate(context: vscode.ExtensionContext): void {
	const analysisCache = new TemplateAnalysisCache();
	const diagnosticsController = new DiagnosticsController(analysisCache);

	context.subscriptions.push(diagnosticsController);
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			[{ scheme: "file" }, { scheme: "untitled" }],
			new TemplateCompletionProvider(analysisCache),
			".",
			'"',
			"'",
		),
		vscode.languages.registerHoverProvider(
			[{ scheme: "file" }, { scheme: "untitled" }],
			new TemplateHoverProvider(analysisCache),
		),
	);

	const refreshIfSupported = async (document: vscode.TextDocument): Promise<void> => {
		const settings = getSettings();
		if (!settings.enabled || !isSupportedLanguage(document.languageId, settings)) {
			diagnosticsController.delete(document.uri);
			return;
		}
		analysisCache.invalidateDocument(document.uri);
		await diagnosticsController.refreshDocument(document);
	};

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			void refreshIfSupported(document);
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			void refreshIfSupported(event.document);
		}),
		vscode.workspace.onDidSaveTextDocument((document) => {
			void refreshIfSupported(document);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			analysisCache.invalidateDocument(document.uri);
			diagnosticsController.delete(document.uri);
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration("templateSchemaIntellisense")) {
				return;
			}
			analysisCache.clear();
			for (const document of vscode.workspace.textDocuments) {
				void refreshIfSupported(document);
			}
		}),
	);

	const schemaWatcher = vscode.workspace.createFileSystemWatcher("**/*.json");
	context.subscriptions.push(schemaWatcher);
	context.subscriptions.push(
		schemaWatcher.onDidChange((uri) => {
			void refreshAffectedDocuments(uri, analysisCache, diagnosticsController);
		}),
		schemaWatcher.onDidCreate((uri) => {
			void refreshAffectedDocuments(uri, analysisCache, diagnosticsController);
		}),
		schemaWatcher.onDidDelete((uri) => {
			void refreshAffectedDocuments(uri, analysisCache, diagnosticsController);
		}),
	);

	for (const document of vscode.workspace.textDocuments) {
		void refreshIfSupported(document);
	}
}

export function deactivate(): void {
	// Nothing to clean up explicitly; VS Code disposes subscriptions for us.
}

async function refreshAffectedDocuments(
	schemaUri: vscode.Uri,
	analysisCache: TemplateAnalysisCache,
	diagnosticsController: DiagnosticsController,
): Promise<void> {
	if (schemaUri.scheme !== "file") {
		return;
	}

	const affectedDocumentUris = analysisCache.invalidateBySchemaPath(schemaUri.fsPath);
	for (const documentUri of affectedDocumentUris) {
		const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === documentUri.toString());
		if (!document) {
			continue;
		}
		await diagnosticsController.refreshDocument(document);
	}
}
