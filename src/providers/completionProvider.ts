import * as vscode from "vscode";

import { TemplateAnalysisCache } from "../core/cache.ts";
import { getCompletionLookup } from "../core/templateIntellisense.ts";

export class TemplateCompletionProvider implements vscode.CompletionItemProvider {
	readonly #analysisCache: TemplateAnalysisCache;

	constructor(analysisCache: TemplateAnalysisCache) {
		this.#analysisCache = analysisCache;
	}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.CompletionItem[] | undefined> {
		const analysis = await this.#analysisCache.getAnalysis(document);
		if (!analysis.pathModel) {
			return undefined;
		}

		const completionLookup = getCompletionLookup(
			document.getText(),
			analysis.rootVariable,
			document.offsetAt(position),
			analysis.pathModel,
		);
		if (!completionLookup) {
			return undefined;
		}

		return completionLookup.suggestions.map((suggestion) => {
			const completionItem = new vscode.CompletionItem(suggestion.name, vscode.CompletionItemKind.Property);
			completionItem.range = new vscode.Range(
				document.positionAt(completionLookup.startOffset),
				document.positionAt(completionLookup.endOffset),
			);
			completionItem.insertText = `${suggestion.name}${completionLookup.insertSuffix}`;
			completionItem.detail = suggestion.required
				? `${suggestion.node.typeText} • required`
				: suggestion.node.typeText;
			completionItem.documentation = createDocumentation(suggestion.node.description, suggestion.node.enumValues);
			completionItem.sortText = `${suggestion.required ? "0" : "1"}-${suggestion.name}`;
			return completionItem;
		});
	}
}

function createDocumentation(
	description: string | undefined,
	enumValues: unknown[],
): vscode.MarkdownString | undefined {
	if (!description && enumValues.length === 0) {
		return undefined;
	}

	const markdown = new vscode.MarkdownString(undefined, true);
	if (description) {
		markdown.appendMarkdown(`${description}\n\n`);
	}
	if (enumValues.length > 0) {
		markdown.appendMarkdown(`**Allowed values:** ${enumValues.map((value) => `\`${JSON.stringify(value)}\``).join(", ")}`);
	}
	markdown.isTrusted = false;
	return markdown;
}
