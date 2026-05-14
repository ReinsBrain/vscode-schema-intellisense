import * as vscode from "vscode";

import { TemplateAnalysisCache } from "../core/cache.ts";
import { getHoverLookup } from "../core/templateIntellisense.ts";

export class TemplateHoverProvider implements vscode.HoverProvider {
	readonly #analysisCache: TemplateAnalysisCache;

	constructor(analysisCache: TemplateAnalysisCache) {
		this.#analysisCache = analysisCache;
	}

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.Hover | undefined> {
		const analysis = await this.#analysisCache.getAnalysis(document);
		if (!analysis.pathModel) {
			return undefined;
		}

		const hoverLookup = getHoverLookup(
			document.getText(),
			analysis.rootVariable,
			document.offsetAt(position),
			analysis.pathModel,
		);
		if (!hoverLookup) {
			return undefined;
		}

		const markdown = new vscode.MarkdownString(undefined, true);
		markdown.appendCodeblock(hoverLookup.hover.path, "text");
		markdown.appendMarkdown(`\n**Type:** ${hoverLookup.hover.typeText}`);
		if (hoverLookup.hover.description) {
			markdown.appendMarkdown(`\n\n${hoverLookup.hover.description}`);
		}
		if (hoverLookup.hover.enumValues.length > 0) {
			markdown.appendMarkdown(
				`\n\n**Allowed values:** ${hoverLookup.hover.enumValues.map((value) => `\`${JSON.stringify(value)}\``).join(", ")}`,
			);
		}
		markdown.isTrusted = false;

		return new vscode.Hover(
			markdown,
			new vscode.Range(document.positionAt(hoverLookup.startOffset), document.positionAt(hoverLookup.endOffset)),
		);
	}
}
