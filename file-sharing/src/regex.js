const unquotedRegexPart = /(?=(?:[^"]*"[^"]*")*[^"]*$)(?=(?:[^']*'[^']*')*[^']*$)/;
const unescapedRegexPart = /(?<=[^\\]|(?:^|[^\\])(?:\\\\)+)/;
export const unescapedCharRegex = (char) => new RegExp(`(?:${unescapedRegexPart.source + (char?.source ?? char)})`);
export const oneOrMoreRegex = (exp) => new RegExp(`(?:${exp?.source ?? exp})+`);
export const zeroOrMoreRegex = (exp) => new RegExp(`(?:${exp?.source ?? exp})*`);
export const unquotedRegex = (exp) => new RegExp((exp?.source ?? exp) + unquotedRegexPart.source);

export const whitespaceDelimiterRegex = unquotedRegex(oneOrMoreRegex(unescapedCharRegex(/\s/)));

export const commaDelimiterRegex = unquotedRegex(unescapedCharRegex(','));

export const anyOfDelimiterRegex = (delims, merge = false) =>
	delims instanceof Array
		? unquotedRegex(`(?:${delims.map(delim => delim.length === 1 ? unescapedCharRegex(delim).source : delim?.source ?? delim).join('|')})${merge ? '+' : ''}`)
		: delims instanceof RegExp
			? anyOfDelimiterRegex([delims], merge)
			: anyOfDelimiterRegex(delims.split(''), merge);
