/**
 * EcoNet IO Engine Boundary Enforcer
 * Validates that all engine modules respect strict encapsulation:
 * 
 * Rules:
 * 1. An engine must NOT import private internal files of another engine (e.g. `../02-observation/domain/model.js`).
 * 2. Cross-engine imports are ONLY permitted via the target engine's top-level entrypoint (`../02-observation/index.js` or `../02-observation`).
 * 3. Engines must not access another engine's private persistence or schemas directory directly.
 */

import fs from 'fs';
import path from 'path';

export class BoundaryEnforcer {
  constructor(enginesDirectory) {
    this.enginesDir = enginesDirectory;
  }

  /**
   * Scan all files in the engines directory and return any boundary violations.
   * @returns {Array<{file: string, line: number, importStatement: string, violation: string}>}
   */
  checkBoundaries() {
    const violations = [];
    if (!fs.existsSync(this.enginesDir)) {
      return violations;
    }

    const files = this._getAllFiles(this.enginesDir);

    for (const file of files) {
      if (!/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i.test(file)) continue;

      const currentEngine = this._getEngineNameFromFile(file);
      if (!currentEngine) continue;

      const content = fs.readFileSync(file, 'utf-8');
      for (const importReference of this._getImportReferences(content)) {
        const check = this._inspectImport(file, currentEngine, importReference.path);
        if (check.isViolation) {
          violations.push({
            file: path.relative(this.enginesDir, file),
            line: importReference.line,
            importStatement: importReference.statement,
            violation: check.reason
          });
        }
      }
    }

    return violations;
  }

  _getEngineNameFromFile(filePath) {
    const relative = path.relative(this.enginesDir, filePath);
    const segments = relative.split(path.sep);
    return /^\d{2}-[a-z0-9-]+$/i.test(segments[0]) ? segments[0] : null;
  }

  _getImportReferences(content) {
    const withoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:\\])\/\/[^\n]*/gm, match => match.replace(/[^\n]/g, ' '));
    const patterns = [
      /(?:^|[;\n])\s*import\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]/gm,
      /(?:^|[;\n])\s*export\s+(?:[\s\S]*?\sfrom\s*)['"]([^'"]+)['"]/gm,
      /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ];
    const references = [];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(withoutComments))) {
        references.push({
          path: match[1],
          line: withoutComments.slice(0, match.index).split('\n').length,
          statement: match[0].trim().replace(/\s+/g, ' ')
        });
      }
    }

    return references;
  }

  _inspectImport(currentFile, currentEngine, importPath) {
    // Relative imports within the SAME engine are allowed
    if (importPath.startsWith('.')) {
      const resolved = path.normalize(path.join(path.dirname(currentFile), importPath));
      const targetEngine = this._getEngineNameFromFile(resolved);

      if (targetEngine && targetEngine !== currentEngine) {
        // Cross-engine relative import detected!
        // Check if it's importing internal directories instead of top-level index
        const relativeToTarget = path.relative(path.join(this.enginesDir, targetEngine), resolved);
        
        // Allowed: `index.js`, `index`, or empty (meaning directory root)
        const isRootImport = relativeToTarget === '' ||
          /^index\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i.test(relativeToTarget) ||
          relativeToTarget === 'index';

        if (!isRootImport) {
          return {
            isViolation: true,
            reason: `Illegal cross-engine internal import: "${currentEngine}" is importing private path "${relativeToTarget}" of "${targetEngine}". Cross-engine communication must go through top-level index.js or Event/Command Bus.`
          };
        }
      }
    }

    // Direct path imports like 'engines/02-observation/domain/...'
    const engineMatch = importPath.match(/engines[/\\](\d{2}-[^/\\]+)(?:[/\\](.*))?$/);
    if (engineMatch) {
      const targetEngine = engineMatch[1];
      const subpath = engineMatch[2] || '';

      if (targetEngine !== currentEngine &&
          subpath !== '' &&
          subpath !== 'index' &&
          !/^index\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i.test(subpath)) {
        return {
          isViolation: true,
          reason: `Illegal cross-engine internal import: "${currentEngine}" is importing "${subpath}" of "${targetEngine}".`
        };
      }
    }

    return { isViolation: false };
  }

  _getAllFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this._getAllFiles(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
