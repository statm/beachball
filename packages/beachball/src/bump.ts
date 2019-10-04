import { getPackageChangeTypes, readChangeFiles, unlinkChangeFiles } from './changefile';
import { getPackageInfos, PackageInfo } from './monorepo';
import { writeChangelog } from './changelog';
import fs from 'fs';
import semver from 'semver';
import { ChangeInfo } from './ChangeInfo';

export type PackageInfo = PackageInfo;

export type BumpInfo = ReturnType<typeof bump>;

export function gatherBumpInfo(cwd: string) {
  // Collate the changes per package
  const changes = readChangeFiles(cwd);
  const packageChangeTypes = getPackageChangeTypes(changes);
  const packageInfos = getPackageInfos(cwd);

  // Clear non-existent changes
  const filteredChanges = changes.filter(change => {
    return packageInfos[change.packageName];
  });

  // Clear non-existent changeTypes
  Object.keys(packageChangeTypes).forEach(packageName => {
    if (!packageInfos[packageName]) {
      delete packageChangeTypes[packageName];
    }
  });

  return {
    packageChangeTypes,
    packageInfos,
    changes: filteredChanges,
  };
}

export function performBump(
  bumpInfo: {
    changes: ChangeInfo[];
    packageInfos: ReturnType<typeof getPackageInfos>;
    packageChangeTypes: ReturnType<typeof getPackageChangeTypes>;
  },
  cwd: string
) {
  const { changes, packageInfos, packageChangeTypes } = bumpInfo;

  // Apply package.json version updates
  Object.keys(packageChangeTypes).forEach(pkgName => {
    const info = packageInfos[pkgName];

    if (!info) {
      console.log(`Unknown package named "${pkgName}" detected from change files, skipping!`);
      return;
    }

    const changeType = packageChangeTypes[pkgName];
    const packageJsonPath = info.packageJsonPath;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

    // Don't bump 'none' type or private packages
    if (changeType !== 'none' && !packageJson.private) {
      packageJson.version = semver.inc(packageJson.version, changeType);
      info.version = packageJson.version;
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  });

  // Apply package dependency bumps
  Object.keys(packageInfos).forEach(pkgName => {
    const info = packageInfos[pkgName];
    const packageJsonPath = info.packageJsonPath;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());

    ['dependencies', 'devDependencies'].forEach(depKind => {
      if (packageJson[depKind]) {
        Object.keys(packageJson[depKind]).forEach(dep => {
          const packageInfo = packageInfos[dep];

          if (packageInfo) {
            const existingVersionRange = packageJson[depKind][dep];
            packageJson[depKind][dep] = bumpMinSemverRange(packageInfo.version, existingVersionRange);
          }
        });
      }
    });

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  });

  // Generate changelog
  writeChangelog(changes, packageInfos);

  // Unlink changelogs
  unlinkChangeFiles(changes, cwd);

  return {
    changes,
    packageChangeTypes,
    packageInfos,
  };
}

export function bump(cwd: string) {
  return performBump(gatherBumpInfo(cwd), cwd);
}

function bumpMinSemverRange(minVersion: string, semverRange: string) {
  if (semverRange.startsWith('~') || semverRange.startsWith('^')) {
    // ~1.0.0
    // ^1.0.0
    return semverRange[0] + minVersion;
  } else if (semverRange.includes('>')) {
    // >=1.0.0 <2.0.0
    return `>=${minVersion} <${semver.inc(minVersion, 'major')}`;
  } else if (semverRange.includes(' - ')) {
    // 1.0.0 - 2.0.0
    return `${minVersion} - ${semver.inc(minVersion, 'major')}`;
  }

  return minVersion;
}
