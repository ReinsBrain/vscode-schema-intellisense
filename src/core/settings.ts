import * as vscode from "vscode";

import type { Settings } from "./types.ts";

const CONFIGURATION_SECTION = "templateSchemaIntellisense";

export function getSettings(): Settings {
	const configuration = vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
	return {
		enabled: configuration.get<boolean>("enabled", true),
		languageIds: configuration.get<string[]>("languageIds", ["eta"]),
		maxHeaderLines: configuration.get<number>("maxHeaderLines", 30),
		pragmaTag: configuration.get<string>("pragmaTag", "@schema"),
		defaultRoot: configuration.get<string>("defaultRoot", "$"),
	};
}

export function isSupportedLanguage(languageId: string, settings: Settings): boolean {
	return settings.languageIds.includes(languageId);
}
