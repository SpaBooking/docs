import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

// Mintlify can accept a page whose unterminated frontmatter swallows its body.
// Check tracked pages explicitly before attempting the documentation build.
const pages = execFileSync('git', ['ls-files', '-z', '--', '*.mdx'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean);

let failures = 0;
for (const page of pages) {
  try {
    const lines = readFileSync(page, 'utf8').split(/\r?\n/);
    if (lines[0] !== '---') throw new Error('Missing opening frontmatter delimiter.');
    const end = lines.findIndex((line, index) => index > 0 && line === '---');
    if (end === -1) throw new Error('Missing closing frontmatter delimiter.');
    const metadata = parse(lines.slice(1, end).join('\n'));
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('Frontmatter must be a YAML object.');
    }
  } catch (error) {
    failures++;
    console.error(`${page}: ${error.message}`);
  }
}
if (failures) process.exitCode = 1;
else console.log(`Validated frontmatter in ${pages.length} MDX pages.`);
