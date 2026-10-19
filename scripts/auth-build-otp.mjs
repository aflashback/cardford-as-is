import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, authRoot, pins, podman, ownerLabel, run, ensureImage, sha256, jsonFile } from './auth-common.mjs';

const sourceRoot = join(root, 'infra/keycloak/otp-policy');
const builder = 'registry.access.redhat.com/ubi9/openjdk-21:1.23@sha256:0f2fbb155820b8edd269e2f465a6b325a6bdcb065f828ec7e72a4dfdc5ca6642';
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(x => x.isDirectory() ? sourceFiles(join(directory, x.name)) : [join(directory, x.name)]).sort();
}
export async function buildOtp({ record = false, test = false } = {}) {
  const sources = [...sourceFiles(join(sourceRoot, 'src')), ...sourceFiles(join(sourceRoot, 'test'))].map(path => ({ path: relative(sourceRoot, path).replaceAll('\\', '/'), sha256: sha256(readFileSync(path)) }));
  const sourceHash = sha256(JSON.stringify(sources));
  const artifact = join(authRoot, 'downloads/cardford-email-otp-policy.jar');
  const pinFile = join(sourceRoot, 'build.json');
  const pin = existsSync(pinFile) ? JSON.parse(readFileSync(pinFile, 'utf8')) : null;
  if (!record && (!pin || pin.sourceHash !== sourceHash || pin.builder !== builder || pin.keycloakImage !== pins.keycloak.image || pin.communityProviderSha256 !== pins.emailOtp.sha256))
    throw Error('OTP addon source/build pins differ; review and rebuild with auth-build-otp.mjs --record.');
  if (!record && !test && existsSync(artifact) && sha256(readFileSync(artifact)) === pin.sha256) return artifact;
  const deps = join(authRoot, 'addon-deps'), output = join(authRoot, 'addon-build', sourceHash);
  mkdirSync(deps, { recursive: true }); mkdirSync(output, { recursive: true });
  // Dependencies originate exclusively from the digest-pinned KC runtime and hash-pinned provider.
  ensureImage(pins.keycloak.image, pins.keycloak.platform);
  const dependencyContainer = run(podman, ['create', '--label', `${ownerLabel}=${authRoot}`, '--entrypoint', '/bin/true', pins.keycloak.image]).trim();
  if (!/^[a-f0-9]{64}$/.test(dependencyContainer)) throw Error('Unrecognized dependency container identity.');
  try { run(podman, ['cp', `${dependencyContainer}:/opt/keycloak/lib/lib/main/.`, deps], { timeout: 60_000 }); }
  finally { run(podman, ['rm', dependencyContainer]); }
  ensureImage(builder);
  const command = [
    'set -eu',
    'mkdir -p /out/classes /out/tests',
    'javac --release 21 -g:none -encoding UTF-8 -proc:none -cp "/deps/*:/provider.jar" -d /out/classes /src/src/io/cardford/auth/*.java',
    'javac --release 21 -g:none -encoding UTF-8 -proc:none -cp /out/classes -d /out/tests /src/test/EmailOtpPolicyTest.java',
    'java -cp /out/classes:/out/tests EmailOtpPolicyTest',
    'mkdir -p /out/classes/META-INF/services',
    'cp /src/src/META-INF/services/org.keycloak.authentication.AuthenticatorFactory /out/classes/META-INF/services/',
    'jar --create --file /tmp/cardford-email-otp-policy.jar --date=2026-10-16T00:00:00Z -C /out/classes .',
    'cat /tmp/cardford-email-otp-policy.jar > /out/cardford-email-otp-policy.jar',
  ].join('\n');
  const log = run(podman, ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'all', '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,size=64m',
    '--volume', `${sourceRoot}:/src:ro`, '--volume', `${deps}:/deps:ro`, '--volume', `${join(authRoot, 'downloads', pins.emailOtp.file)}:/provider.jar:ro`, '--volume', `${output}:/out:rw`,
    '--entrypoint', '/bin/sh', builder, '-c', command], { timeout: 120_000, diagnostic: true });
  console.log(log.trim());
  const built = join(output, 'cardford-email-otp-policy.jar'), hash = sha256(readFileSync(built));
  if (!record && hash !== pin.sha256) throw Error('Rebuilt OTP addon differs from its reviewed artifact checksum.');
  copyFileSync(built, artifact);
  if (record) jsonFile(pinFile, { schemaVersion: 1, builder, keycloakImage: pins.keycloak.image, communityProviderSha256: pins.emailOtp.sha256, sourceHash, sources, sha256: hash, artifact: 'cardford-email-otp-policy.jar', policy: { lifetimeSeconds: 300, maxAttempts: 5, resendSeconds: 60 }, license: 'Apache-2.0; linked community provider remains Elastic-2.0' });
  console.log(`OTP addon verified: sha256:${hash}`);
  return artifact;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildOtp({ record: process.argv.includes('--record'), test: process.argv.includes('--test') });
