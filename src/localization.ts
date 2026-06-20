export interface AppLocalization {
	insertTableLabel: string;
	addRowLabel: string;
	addColumnLabel: string;
	insertRowAboveLabel: string;
	insertRowBelowLabel: string;
	insertColumnLeftLabel: string;
	insertColumnRightLabel: string;
	clearCellLabel: string;
	deleteRowLabel: string;
	deleteColumnLabel: string;
}

const defaultStrings: AppLocalization = {
	insertTableLabel: 'Insert table',
	addRowLabel: 'Add row',
	addColumnLabel: 'Add column',
	insertRowAboveLabel: 'Insert row above',
	insertRowBelowLabel: 'Insert row below',
	insertColumnLeftLabel: 'Insert column left',
	insertColumnRightLabel: 'Insert column right',
	clearCellLabel: 'Clear cell',
	deleteRowLabel: 'Delete row',
	deleteColumnLabel: 'Delete column',
};

const strings: AppLocalization = { ...defaultStrings };

const localizations: Record<string, Partial<AppLocalization>> = {
	ru: {
		insertTableLabel: 'Вставить таблицу',
		addRowLabel: 'Добавить строку',
		addColumnLabel: 'Добавить столбец',
		insertRowAboveLabel: 'Вставить строку выше',
		insertRowBelowLabel: 'Вставить строку ниже',
		insertColumnLeftLabel: 'Вставить столбец слева',
		insertColumnRightLabel: 'Вставить столбец справа',
		clearCellLabel: 'Очистить ячейку',
		deleteRowLabel: 'Удалить строку',
		deleteColumnLabel: 'Удалить столбец',
	},
};

const getNavigatorLanguages = (): readonly string[] => {
	if (typeof navigator === 'undefined') {
		return [];
	}

	if (navigator.languages?.length > 0) {
		return navigator.languages;
	}

	return navigator.language ? [navigator.language] : [];
};

const normalizeLocale = (locale: string): string => locale.replace('_', '-');

const getLanguageCode = (locale: string): string | undefined => {
	const localeSeparatorIndex = locale.indexOf('-');

	return localeSeparatorIndex === -1 ? undefined : locale.substring(0, localeSeparatorIndex);
};

const getSupportedLanguages = (locales: readonly string[]): string[] => {
	const languages: string[] = [];

	for (const locale of locales) {
		const normalizedLocale = normalizeLocale(locale);
		languages.push(normalizedLocale);

		const languageCode = getLanguageCode(normalizedLocale);

		if (languageCode) {
			languages.push(languageCode);
		}
	}

	return languages;
};

const findLocalization = (languages: readonly string[]): Partial<AppLocalization> => {
	for (const language of languages) {
		const localization = localizations[language];

		if (localization) {
			return localization;
		}
	}

	return {};
};

export const setLocale = (supportedLocales: readonly string[] | string) => {
	const locales = typeof supportedLocales === 'string' ? [supportedLocales] : supportedLocales;
	const languages = getSupportedLanguages(locales);

	Object.assign(strings, defaultStrings, findLocalization(languages));
};

setLocale(getNavigatorLanguages());

export default strings;
