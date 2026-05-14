import { findChainAtOffset, findCompletionContext, extractChainMatches } from "./templateContextExtractor.ts";
import { SchemaPathModel } from "./pathModel.ts";
import type { AnalyzerDiagnostic, CompletionSuggestion, HoverResult } from "./types.ts";

export type CompletionLookup = {
	suggestions: CompletionSuggestion[];
	startOffset: number;
	endOffset: number;
	insertSuffix: string;
};

export type HoverLookup = {
	hover: HoverResult;
	startOffset: number;
	endOffset: number;
};

export function getCompletionLookup(
	documentText: string,
	rootVariable: string,
	offset: number,
	pathModel: SchemaPathModel,
): CompletionLookup | undefined {
	const completionContext = findCompletionContext(documentText, rootVariable, offset);
	if (!completionContext) {
		return undefined;
	}

	return {
		suggestions: pathModel.getSuggestions(completionContext.segments, completionContext.partialSegment),
		startOffset: completionContext.startOffset,
		endOffset: completionContext.endOffset,
		insertSuffix: completionContext.insertSuffix,
	};
}

export function getHoverLookup(
	documentText: string,
	rootVariable: string,
	offset: number,
	pathModel: SchemaPathModel,
): HoverLookup | undefined {
	const chainMatch = findChainAtOffset(documentText, rootVariable, offset);
	if (!chainMatch) {
		return undefined;
	}

	const hover = pathModel.getHover(chainMatch.segments);
	if (!hover) {
		return undefined;
	}

	return {
		hover,
		startOffset: chainMatch.startOffset,
		endOffset: chainMatch.endOffset,
	};
}

export function getPathDiagnostics(
	documentText: string,
	rootVariable: string,
	pathModel: SchemaPathModel,
): AnalyzerDiagnostic[] {
	const diagnostics: AnalyzerDiagnostic[] = [];

	for (const chainMatch of extractChainMatches(documentText, rootVariable)) {
		const resolution = pathModel.resolve(chainMatch.segments);
		if (resolution.invalidSegmentIndex === undefined) {
			continue;
		}

		const invalidStartOffset = chainMatch.segmentDetails[resolution.invalidSegmentIndex]?.valueStartOffset ?? chainMatch.startOffset;
		const invalidSegments = chainMatch.segments.slice(resolution.invalidSegmentIndex);
		diagnostics.push({
			code: "TSI004",
			message: `Unknown property path: ${rootVariable}.${invalidSegments.join(".")}`,
			severity: "warning",
			startOffset: invalidStartOffset,
			endOffset: chainMatch.endOffset,
		});
	}

	return diagnostics;
}
