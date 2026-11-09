import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Load the actual route implementation, rejecting any dependency that was not
// explicitly replaced. This keeps unit tests from importing Prisma/providers.
export function loadRoute<T>(
  path: string,
  dependencies: Record<string, unknown>,
  options: { console?: Console } = {}
): T {
  const source = readFileSync(
    new URL(`../../${path}`, import.meta.url),
    'utf8'
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const routeExports = {};
  runInNewContext(code, {
    exports: routeExports,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected route dependency: ${name}`);
      return dependencies[name];
    },
    console: options.console || console,
    URL,
    URLSearchParams,
  });
  return routeExports as T;
}
