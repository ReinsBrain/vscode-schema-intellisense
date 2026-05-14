export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;


export type JsonObject = {
	[key: string]: JsonValue;
};

export type JsonArray = JsonValue[];

export type JsonSchema = boolean | JsonObject;

export type Settings = {
	enabled: boolean;
	languageIds: string[];
	maxHeaderLines: number;
	pragmaTag: string;
	defaultRoot: string;
};

export type PragmaInfo = {
	schemaPath: string;
	rootVariable: string;
	line: number;
	startCharacter: number;
	endCharacter: number;
};

export type PragmaError = {
	code: "TSI001";
	message: string;
	line: number;
	startCharacter: number;
	endCharacter: number;
};

export type ParsePragmaResult = {
	pragma?: PragmaInfo;
	error?: PragmaError;
};

export type SchemaIssue = {
	code: "TSI002" | "TSI003";
	message: string;
	schemaPath: string;
};

export type SchemaResource = {
	filePath: string;
	uri: string;
	schema: JsonSchema;
};

export type LoadedSchemaData = {
	rootFilePath: string;
	rootUri: string;
	resources: Map<string, SchemaResource>;
	issues: SchemaIssue[];
};

export type SchemaNode = {
	typeText: string;
	description?: string;
	enumValues: JsonValue[];
	properties: Map<string, SchemaNode>;
	required: Set<string>;
};

export type ResolvePathResult = {
	node?: SchemaNode;
	invalidSegmentIndex?: number;
};

export type ChainSegment = {
	name: string;
	valueStartOffset: number;
	valueEndOffset: number;
	notation: "dot" | "bracket";
};

export type ChainMatch = {
	fullText: string;
	segments: string[];
	segmentDetails: ChainSegment[];
	startOffset: number;
	endOffset: number;
	hasTrailingDot: boolean;
};

export type ExpressionRange = {
	startOffset: number;
	endOffset: number;
	contentStartOffset: number;
	contentEndOffset: number;
	content: string;
};

export type CompletionContext = {
	segments: string[];
	partialSegment: string;
	startOffset: number;
	endOffset: number;
	notation: "dot" | "bracket";
	insertSuffix: string;
};

export type CompletionSuggestion = {
	name: string;
	node: SchemaNode;
	required: boolean;
};

export type HoverResult = {
	path: string;
	typeText: string;
	description?: string;
	enumValues: JsonValue[];
};

export type AnalyzerDiagnostic = {
	code: "TSI001" | "TSI002" | "TSI003" | "TSI004";
	message: string;
	severity: "error" | "warning";
	startOffset: number;
	endOffset: number;
};
