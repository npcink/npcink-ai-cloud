import { isDeepStrictEqual } from 'node:util';
import { __debug, format } from 'prettier';

const parsers = new Map([['javascript', 'babel'], ['css', 'css'], ['json', 'json']]);
const language = process.argv[2];
const parser = parsers.get(language);
if (!parser) process.exit(1);

let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) source += chunk;

async function candidate() {
  const crlf = source.includes('\r\n');
  if (/\r/u.test(source.replaceAll('\r\n', ''))
      || (crlf && source.replaceAll('\r\n', '').includes('\n'))
      || source.includes('prettier-ignore')) return null;
  const options = { parser, endOfLine: crlf ? 'crlf' : 'lf', embeddedLanguageFormatting: 'off' };
  try {
    if (language === 'json') JSON.parse(source);
    const output = await format(source, options);
    if (language === 'json') JSON.parse(output);
    const before = await __debug.parse(source, options, { massage: true });
    const after = await __debug.parse(output, options, { massage: true });
    if (!isDeepStrictEqual(before.ast, after.ast) || await format(output, options) !== output) return null;
    return output;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

try {
  process.stdout.write(JSON.stringify(await candidate()));
} catch {
  // Parser diagnostics can contain submitted code.
  process.exitCode = 1;
}
