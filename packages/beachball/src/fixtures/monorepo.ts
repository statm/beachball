import * as process from 'process';
import path from 'path';
import * as fs from 'fs-extra';
import { promisify } from 'util';
import { runCommands } from './exec';
import { tmpdir, DirResult } from './tmpdir';
import { BeachballOptions } from '../types/BeachballOptions';
import { Repository } from './repository';

const writeFileAsync = promisify(fs.writeFile);

export const packageJsonFixtures = {
  'packages/foo': {
    name: 'foo',
    version: '1.0.0',
    dependencies: {
      bar: '^1.3.4',
    },
  },

  'packages/bar': {
    name: 'bar',
    version: '1.3.4',
  },

  'packages/grouped/a': {
    name: 'a',
    version: '3.1.2',
  },

  'packages/grouped/b': {
    name: 'b',
    version: '3.1.2',
    dependencies: ['bar'],
  },
};

const beachballConfigFixture = {
  groups: [
    {
      disallowedChangeTypes: null,
      name: 'grouped',
      include: 'grouped*',
    },
  ],
} as BeachballOptions;

export class MonoRepoFactory {
  root?: DirResult;

  async create(): Promise<void> {
    const originalDirectory = process.cwd();

    this.root = await tmpdir({ prefix: 'beachball-monorepository-upstream-' });
    process.chdir(this.root!.name);
    await runCommands(['git init --bare']);

    const tmpRepo = new Repository();
    await tmpRepo.initialize();
    await tmpRepo.cloneFrom(this.root.name);
    await tmpRepo.commitChange('README');

    await Object.keys(packageJsonFixtures).reduce(async (p, pkg) => {
      await p;
      const packageJsonFixture = packageJsonFixtures[pkg];
      const packageJsonFile = path.join(tmpRepo.rootPath, pkg, 'package.json');

      fs.mkdirpSync(path.dirname(packageJsonFile));

      await writeFileAsync(packageJsonFile, JSON.stringify(packageJsonFixture, null, 2));
      await tmpRepo.commitChange(packageJsonFile);
    }, Promise.resolve());

    await tmpRepo.commitChange('package.json', JSON.stringify({ name: 'monorepo-fixture', version: '1.0.0' }, null, 2));
    await tmpRepo.commitChange(
      'beachball.config.js',
      'module.exports = ' + JSON.stringify(beachballConfigFixture, null, 2)
    );
    await tmpRepo.push('origin', 'HEAD:master');

    process.chdir(originalDirectory);
  }

  async cloneRepository(): Promise<Repository> {
    if (!this.root) {
      throw new Error('Must create before cloning');
    }
    const newRepo = new Repository();
    await newRepo.initialize();
    await newRepo.cloneFrom(this.root.name);
    return newRepo;
  }
}
