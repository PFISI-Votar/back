import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcRoot = path.join(root, 'src');

const files = execSync('find src test -name "*.ts" -type f', { cwd: root })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const toAlias = (importPath, filePath) => {
  if (!importPath.startsWith('.')) {
    return importPath;
  }
  const absoluteFile = path.join(root, filePath);
  const absoluteImport = path.resolve(path.dirname(absoluteFile), importPath);
  const relativeToSrc = path
    .relative(srcRoot, absoluteImport)
    .replace(/\\/g, '/');
  if (!relativeToSrc.startsWith('..')) {
    return `@/${relativeToSrc}`;
  }
  return importPath;
};

for (const file of files) {
  const fullPath = path.join(root, file);
  const original = readFileSync(fullPath, 'utf8');
  const updated = original.replace(
    /from ['"](\.[^'"]+)['"]/g,
    (match, importPath) => `from '${toAlias(importPath, file)}'`,
  );
  if (updated !== original) {
    writeFileSync(fullPath, updated);
  }
}
