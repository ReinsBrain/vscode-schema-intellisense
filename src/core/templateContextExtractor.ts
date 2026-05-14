import type { ChainMatch, ChainSegment, CompletionContext, ExpressionRange } from "./types.ts";

const ETA_EXPRESSION_PATTERN = /<%([=-]?)([\s\S]*?)%>/gu;
const IDENTIFIER_BOUNDARY_PATTERN = /[A-Za-z0-9_$]/u;
const WHITESPACE_PATTERN = /\s/u;

export function extractExpressionRanges(documentText: string): ExpressionRange[] {
	const ranges: ExpressionRange[] = [];
	for (const match of documentText.matchAll(ETA_EXPRESSION_PATTERN)) {
		const fullMatch = match[0];
		const expressionBody = match[2] ?? "";
		const matchIndex = match.index ?? 0;
		const contentStartOffset = matchIndex + fullMatch.indexOf(expressionBody);
		const contentEndOffset = contentStartOffset + expressionBody.length;
		ranges.push({
			startOffset: matchIndex,
			endOffset: matchIndex + fullMatch.length,
			contentStartOffset,
			contentEndOffset,
			content: expressionBody,
		});
	}

	return ranges;
}

export function extractChainMatches(documentText: string, rootVariable: string): ChainMatch[] {
	const chainMatches: ChainMatch[] = [];

	for (const expressionRange of extractExpressionRanges(documentText)) {
		for (const rootIndex of findRootIndexes(expressionRange.content, rootVariable)) {
			const parsedChain = parseResolvedChain(expressionRange.content, rootVariable, rootIndex, expressionRange.contentStartOffset);
			if (!parsedChain) {
				continue;
			}

			chainMatches.push(parsedChain);
		}
	}

	return chainMatches;
}

export function findChainAtOffset(documentText: string, rootVariable: string, offset: number): ChainMatch | undefined {
	return extractChainMatches(documentText, rootVariable).find(
		(chainMatch) => offset >= chainMatch.startOffset && offset <= chainMatch.endOffset,
	);
}

export function findCompletionContext(
	documentText: string,
	rootVariable: string,
	offset: number,
): CompletionContext | undefined {
	const expressionRange = findExpressionRangeAtOffset(documentText, offset);
	if (!expressionRange) {
		return undefined;
	}

	const relativeOffset = offset - expressionRange.contentStartOffset;
	const prefix = expressionRange.content.slice(0, relativeOffset);
	let lastContext: CompletionContext | undefined;
	for (const rootIndex of findRootIndexes(prefix, rootVariable)) {
		const completionContext = parseCompletionContext(prefix, rootVariable, rootIndex, expressionRange.contentStartOffset);
		if (completionContext) {
			lastContext = completionContext;
		}
	}

	return lastContext;
}

function findExpressionRangeAtOffset(documentText: string, offset: number): ExpressionRange | undefined {
	return extractExpressionRanges(documentText).find(
		(range) => offset >= range.contentStartOffset && offset <= range.contentEndOffset,
	);
}

function parseResolvedChain(
	text: string,
	rootVariable: string,
	rootIndex: number,
	baseOffset: number,
): ChainMatch | undefined {
	if (!isRootCandidate(text, rootVariable, rootIndex)) {
		return undefined;
	}

	const parsedSequence = parseAccessorSequence(text, rootVariable, rootIndex, false, baseOffset);
	if (!parsedSequence || parsedSequence.segments.length === 0) {
		return undefined;
	}

	return {
		fullText: text.slice(rootIndex, parsedSequence.endIndex),
		segments: parsedSequence.segments.map((segment) => segment.name),
		segmentDetails: parsedSequence.segments,
		startOffset: baseOffset + rootIndex,
		endOffset: baseOffset + parsedSequence.endIndex,
		hasTrailingDot: false,
	};
}

function parseCompletionContext(
	text: string,
	rootVariable: string,
	rootIndex: number,
	baseOffset: number,
): CompletionContext | undefined {
	if (!isRootCandidate(text, rootVariable, rootIndex)) {
		return undefined;
	}

	return parseAccessorSequence(text, rootVariable, rootIndex, true, baseOffset)?.completionContext;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findRootIndexes(text: string, rootVariable: string): number[] {
	const indexes: number[] = [];
	let searchIndex = 0;
	while (searchIndex < text.length) {
		const matchIndex = text.indexOf(rootVariable, searchIndex);
		if (matchIndex < 0) {
			break;
		}
		indexes.push(matchIndex);
		searchIndex = matchIndex + rootVariable.length;
	}
	return indexes;
}

function isRootCandidate(text: string, rootVariable: string, rootIndex: number): boolean {
	if (!text.startsWith(rootVariable, rootIndex)) {
		return false;
	}

	if (!isIdentifierBoundary(text[rootIndex - 1])) {
		return false;
	}

	const nextCharacter = text[rootIndex + rootVariable.length];
	if (nextCharacter === ".") {
		return true;
	}

	const nextNonWhitespaceIndex = skipWhitespace(text, rootIndex + rootVariable.length);
	return text[nextNonWhitespaceIndex] === "[";
}

function parseAccessorSequence(
	text: string,
	rootVariable: string,
	rootIndex: number,
	allowPartial: boolean,
	baseOffset: number,
):
	| {
		segments: ChainSegment[];
		endIndex: number;
		completionContext?: CompletionContext;
	  }
	| undefined {
	let cursor = rootIndex + rootVariable.length;
	const segments: ChainSegment[] = [];

	while (cursor < text.length) {
		const accessorResult = parseAccessor(text, cursor, allowPartial, baseOffset, segments.map((segment) => segment.name));
		if (!accessorResult) {
			break;
		}

		if (accessorResult.type === "partial") {
			return {
				segments,
				endIndex: text.length,
				completionContext: accessorResult.context,
			};
		}

		segments.push(accessorResult.segment);
		cursor = accessorResult.nextIndex;
	}

	if (segments.length === 0) {
		return undefined;
	}

	return {
		segments,
		endIndex: cursor,
	};
}

function parseAccessor(
	text: string,
	cursor: number,
	allowPartial: boolean,
	baseOffset: number,
	resolvedSegments: string[],
):
	| { type: "segment"; segment: ChainSegment; nextIndex: number }
	| { type: "partial"; context: CompletionContext }
	| undefined {
	if (text[cursor] === ".") {
		return parseDotAccessor(text, cursor, allowPartial, baseOffset, resolvedSegments);
	}

	const bracketIndex = skipWhitespace(text, cursor);
	if (text[bracketIndex] === "[") {
		return parseBracketAccessor(text, bracketIndex, allowPartial, baseOffset, resolvedSegments);
	}

	return undefined;
}

function parseDotAccessor(
	text: string,
	dotIndex: number,
	allowPartial: boolean,
	baseOffset: number,
	resolvedSegments: string[],
):
	| { type: "segment"; segment: ChainSegment; nextIndex: number }
	| { type: "partial"; context: CompletionContext }
	| undefined {
	const valueStartIndex = dotIndex + 1;
	if (valueStartIndex >= text.length) {
		if (!allowPartial) {
			return undefined;
		}

		return {
			type: "partial",
			context: {
				segments: resolvedSegments,
				partialSegment: "",
				startOffset: baseOffset + valueStartIndex,
				endOffset: baseOffset + text.length,
				notation: "dot",
				insertSuffix: "",
			},
		};
	}

	if (!isIdentifierStart(text[valueStartIndex])) {
		return undefined;
	}

	let valueEndIndex = valueStartIndex + 1;
	while (valueEndIndex < text.length && isIdentifierPart(text[valueEndIndex])) {
		valueEndIndex += 1;
	}

	const segmentName = text.slice(valueStartIndex, valueEndIndex);
	if (allowPartial && valueEndIndex === text.length) {
		return {
			type: "partial",
			context: {
				segments: resolvedSegments,
				partialSegment: segmentName,
				startOffset: baseOffset + valueStartIndex,
				endOffset: baseOffset + valueEndIndex,
				notation: "dot",
				insertSuffix: "",
			},
		};
	}

	return {
		type: "segment",
		segment: {
			name: segmentName,
			valueStartOffset: baseOffset + valueStartIndex,
			valueEndOffset: baseOffset + valueEndIndex,
			notation: "dot",
		},
		nextIndex: valueEndIndex,
	};
}

function parseBracketAccessor(
	text: string,
	bracketIndex: number,
	allowPartial: boolean,
	baseOffset: number,
	resolvedSegments: string[],
):
	| { type: "segment"; segment: ChainSegment; nextIndex: number }
	| { type: "partial"; context: CompletionContext }
	| undefined {
	let cursor = skipWhitespace(text, bracketIndex + 1);
	const quoteCharacter = text[cursor];
	if (quoteCharacter !== '"' && quoteCharacter !== "'") {
		return undefined;
	}

	cursor += 1;
	const valueStartIndex = cursor;
	const quotedString = readQuotedString(text, cursor, quoteCharacter);
	if (!quotedString) {
		return undefined;
	}

	if (!quotedString.isComplete) {
		if (!allowPartial) {
			return undefined;
		}

		return {
			type: "partial",
			context: {
				segments: resolvedSegments,
				partialSegment: quotedString.value,
				startOffset: baseOffset + valueStartIndex,
				endOffset: baseOffset + text.length,
				notation: "bracket",
				insertSuffix: `${quoteCharacter}]`,
			},
		};
	}

	const postQuoteIndex = skipWhitespace(text, quotedString.endIndex);
	if (text[postQuoteIndex] !== "]") {
		return undefined;
	}

	return {
		type: "segment",
		segment: {
			name: quotedString.value,
			valueStartOffset: baseOffset + valueStartIndex,
			valueEndOffset: baseOffset + quotedString.valueEndIndex,
			notation: "bracket",
		},
		nextIndex: postQuoteIndex + 1,
	};
}

function readQuotedString(
	text: string,
	startIndex: number,
	quoteCharacter: '"' | "'",
): { value: string; valueEndIndex: number; endIndex: number; isComplete: boolean } | undefined {
	let cursor = startIndex;
	let value = "";

	while (cursor < text.length) {
		const character = text[cursor];
		if (character === quoteCharacter) {
			return {
				value,
				valueEndIndex: cursor,
				endIndex: cursor + 1,
				isComplete: true,
			};
		}

		if (character === "\\") {
			const decodedEscape = decodeEscapeSequence(text, cursor + 1);
			if (!decodedEscape) {
				return {
					value,
					valueEndIndex: text.length,
					endIndex: text.length,
					isComplete: false,
				};
			}

			value += decodedEscape.value;
			cursor = decodedEscape.nextIndex;
			continue;
		}

		value += character;
		cursor += 1;
	}

	return {
		value,
		valueEndIndex: text.length,
		endIndex: text.length,
		isComplete: false,
	};
}

function decodeEscapeSequence(
	text: string,
	startIndex: number,
): { value: string; nextIndex: number } | undefined {
	const escapeCharacter = text[startIndex];
	if (!escapeCharacter) {
		return undefined;
	}

	if (escapeCharacter === "u") {
		const hexDigits = text.slice(startIndex + 1, startIndex + 5);
		if (!/^[0-9a-fA-F]{4}$/u.test(hexDigits)) {
			return undefined;
		}

		return {
			value: String.fromCodePoint(Number.parseInt(hexDigits, 16)),
			nextIndex: startIndex + 5,
		};
	}

	const decodedValue = ESCAPE_SEQUENCES[escapeCharacter] ?? escapeCharacter;
	return {
		value: decodedValue,
		nextIndex: startIndex + 1,
	};
}

function skipWhitespace(text: string, startIndex: number): number {
	let cursor = startIndex;
	while (cursor < text.length && WHITESPACE_PATTERN.test(text[cursor])) {
		cursor += 1;
	}
	return cursor;
}

function isIdentifierStart(value: string | undefined): boolean {
	return value !== undefined && /[A-Za-z_$]/u.test(value);
}

function isIdentifierPart(value: string | undefined): boolean {
	return value !== undefined && /[A-Za-z0-9_$]/u.test(value);
}

const ESCAPE_SEQUENCES: Record<string, string> = {
	"0": "\0",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
	v: "\v",
	"\\": "\\",
	"\"": '"',
	"'": "'",
};

export function isIdentifierBoundary(value: string | undefined): boolean {
	return !value || !IDENTIFIER_BOUNDARY_PATTERN.test(value);
}
