import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTaskWorktree } from '../../scripts/dev/worktree.mjs';

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

test('worker sparse exclusions precede first checkout and never smudge legacy data', async () => {
  const scratch = mkdtempSync(
    path.join(tmpdir(), 'kiarakraft-worktree-privacy-')
  );
  const repository = path.join(scratch, 'repository');
  const marker = path.join(scratch, 'smudged.log');
  const probe = path.join(scratch, 'probe.mjs');
  const environment = {
    PATH: process.env.PATH,
    HOME: scratch,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    HUSKY: '0',
  };
  mkdirSync(repository);
  const git = args =>
    execFileSync('git', args, {
      cwd: repository,
      env: environment,
      stdio: 'pipe',
    });
  try {
    git(['init', '--initial-branch=main']);
    git(['config', 'user.name', 'Synthetic worktree regression']);
    git(['config', 'user.email', 'worktree@example.invalid']);
    mkdirSync(path.join(scratch, 'empty-hooks'));
    git(['config', 'core.hooksPath', path.join(scratch, 'empty-hooks')]);
    mkdirSync(path.join(repository, 'prisma'));
    mkdirSync(path.join(repository, '.vercel'));
    writeFileSync(
      path.join(repository, 'README.md'),
      'Synthetic safe source\n'
    );
    writeFileSync(
      path.join(repository, 'prisma/dev.db'),
      'Synthetic legacy database; no real information\n'
    );
    writeFileSync(
      path.join(repository, '.env'),
      'SYNTHETIC_PRIVATE_VALUE=not-a-real-credential\n'
    );
    writeFileSync(
      path.join(repository, '.env.example'),
      'SYNTHETIC_SETTING=replace-me\n'
    );
    writeFileSync(
      path.join(repository, '.vercel/project.json'),
      '{"synthetic":true}\n'
    );
    writeFileSync(
      path.join(repository, '.gitattributes'),
      'prisma/dev.db filter=privacyprobe\n'
    );
    git(['add', '.']);
    git(['commit', '-m', 'Synthetic fixture only']);
    writeFileSync(
      probe,
      "import fs from 'node:fs'; const input=fs.readFileSync(0); fs.appendFileSync(process.argv[2], 'smudged\\n'); process.stdout.write(input);\n"
    );
    git([
      'config',
      'filter.privacyprobe.smudge',
      `${quote(process.execPath)} ${quote(probe)} ${quote(marker)}`,
    ]);

    // Prove the detector really runs on an ordinary checkout before relying on
    // its absence. This positive control contains only the fake test database.
    const control = path.join(scratch, 'unsafe-control');
    git(['worktree', 'add', '--detach', control, 'HEAD']);
    assert.ok(
      existsSync(marker),
      'Smudge detector must catch a normal checkout'
    );
    git(['worktree', 'remove', '--force', control]);
    rmSync(marker);

    const worker = path.join(repository, '.worktrees', 'privacy-check');
    const commands = [];
    const assertPrivateAbsent = () => {
      for (const name of ['prisma/dev.db', '.env', '.vercel/project.json']) {
        assert.ok(
          !existsSync(path.join(worker, name)),
          `Private fixture ${name} was materialized`
        );
      }
      assert.ok(
        !existsSync(marker),
        'Legacy data reached a checkout smudge filter'
      );
    };
    const result = await createTaskWorktree('privacy-check', {
      baseRoot: repository,
      environment,
      execute: async (command, args) => {
        assert.equal(command, 'git');
        commands.push(args);
        assertPrivateAbsent();
        git(args);
        assertPrivateAbsent();
        if (commands.length === 1)
          assert.ok(
            !existsSync(path.join(worker, 'README.md')),
            'Initial worktree creation must perform no checkout'
          );
      },
    });
    assert.equal(result, worker);
    assert.ok(commands[0].includes('--no-checkout'));
    assert.ok(commands[1].includes('sparse-checkout'));
    assert.ok(commands[2].includes('read-tree'));
    assert.equal(
      readFileSync(path.join(worker, 'README.md'), 'utf8'),
      'Synthetic safe source\n'
    );
    assert.ok(
      existsSync(path.join(worker, '.env.example')),
      'The safe environment template must remain available'
    );
    assertPrivateAbsent();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
