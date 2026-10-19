import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, authRoot, configFile, pgbin, podman, pins, containerName, ownerLabel, secret, config, run, ensureImage, jsonFile, sha256, sql, pgEnv, inspectContainer, provisionTokenKey } from './auth-common.mjs';
import { realmDefinition } from './auth-realm.mjs';
import { buildOtp } from './auth-build-otp.mjs';

const openssl = 'C:/Program Files/Git/usr/bin/openssl.exe';
export function machineNetwork() {
  const route = run(podman, ['machine', 'ssh', 'ip -4 route get 1.1.1.1']);
  const gateway = route.match(/\bvia (172\.\d+\.\d+\.\d+)\b/)?.[1];
  const vmAddress = route.match(/\bsrc (172\.\d+\.\d+\.\d+)\b/)?.[1];
  if (!gateway || !vmAddress) throw Error('Expected private WSL NAT route; refusing to bind a LAN interface.');
  const interfaces = JSON.parse(run('powershell.exe', ['-NoProfile', '-Command', 'Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias,IPAddress | ConvertTo-Json -Compress']));
  if (!interfaces.some(x => x.IPAddress === gateway && /^vEthernet \(WSL/.test(x.InterfaceAlias))) throw Error('Podman gateway is not the Windows WSL virtual interface.');
  return { gateway, vmAddress };
}
function secureDirectory() {
  const identity = run('whoami.exe', []).trim();
  run('icacls.exe', [authRoot, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F']);
}
function certificates(c) {
  mkdirSync(join(authRoot, 'tls'), { recursive: true });
  if (existsSync(c.caFile) && existsSync(c.tls.keyFile) && existsSync(c.tls.certFile)) return;
  const caKey = join(authRoot, 'tls/ca-key.pem'), csr = join(authRoot, 'tls/server.csr'), ext = join(authRoot, 'tls/server.ext');
  run(openssl, ['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-days', '365', '-subj', '/CN=CardFord local auth development CA', '-keyout', caKey, '-out', c.caFile, '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run(openssl, ['req', '-newkey', 'rsa:3072', '-nodes', '-subj', '/CN=localhost', '-keyout', c.tls.keyFile, '-out', csr]);
  writeFileSync(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,DNS:*.localhost,DNS:cardford-db,IP:127.0.0.1\n');
  run(openssl, ['x509', '-req', '-in', csr, '-CA', c.caFile, '-CAkey', caKey, '-CAcreateserial', '-days', '90', '-extfile', ext, '-out', c.tls.certFile]);
}
export function startPostgres(c) {
  const data = join(authRoot, 'postgres/data'), pw = join(authRoot, 'postgres/init-password.txt');
  mkdirSync(join(authRoot, 'postgres'), { recursive: true });
  if (!existsSync(join(data, 'PG_VERSION'))) {
    if (existsSync(data)) throw Error('Refusing an unrecognized auth PostgreSQL directory.');
    writeFileSync(pw, c.resources.pgPassword + '\n', { mode: 0o600 });
    try { run(join(pgbin, 'initdb.exe'), ['-D', data, '-U', 'cardford_auth_owner', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${pw}`]); }
    finally { writeFileSync(pw, ''); }
  }
  // Only loopback and the verified WSL virtual interface; no game cluster edits.
  const quote = path => path.replaceAll('\\', '/').replaceAll("'", "''");
  writeFileSync(join(data, 'postgresql.auto.conf'), `listen_addresses='127.0.0.1,${c.resources.gateway}'\nport=54332\npassword_encryption='scram-sha-256'\nssl=on\nssl_cert_file='${quote(c.tls.certFile)}'\nssl_key_file='${quote(c.tls.keyFile)}'\n`);
  writeFileSync(join(data, 'pg_hba.conf'), `# CardFord auth-only cluster. Never add the game cluster here.\nhostssl all cardford_auth_owner 127.0.0.1/32 scram-sha-256\nhostssl cardford_auth_local_dev,cardford_auth_local_test cardford_auth_app 127.0.0.1/32 scram-sha-256\nhostssl cardford_auth_keycloak cardford_auth_keycloak ${c.resources.vmAddress}/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n`);
  const status = run(join(pgbin, 'pg_ctl.exe'), ['-D', data, 'status'], { env: pgEnv(c), timeout: 5000 });
  return status;
}
export function ensurePostgres(c) {
  // pg_ctl status uses exit 3 for stopped; initialize/configure before checking.
  try { startPostgres(c); } catch (e) {
    if (!existsSync(join(authRoot, 'postgres/data/PG_VERSION'))) throw e;
    run(join(pgbin, 'pg_ctl.exe'), ['-D', join(authRoot, 'postgres/data'), '-l', join(authRoot, 'postgres/postgres.log'), '-w', '-t', '30', 'start'], { env: pgEnv(c), stdio: 'ignore', timeout: 40_000 });
  }
  sql(c, `SELECT format('CREATE ROLE cardford_auth_app LOGIN PASSWORD %L', '${c.resources.appPassword}') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cardford_auth_app')\n\\gexec\nSELECT format('CREATE ROLE cardford_auth_keycloak LOGIN PASSWORD %L', '${c.keycloak.databasePassword}') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cardford_auth_keycloak')\n\\gexec\n`);
  for (const [database, owner] of [['cardford_auth_local_dev', 'cardford_auth_app'], ['cardford_auth_local_test', 'cardford_auth_app'], ['cardford_auth_keycloak', 'cardford_auth_keycloak']]) {
    sql(c, `SELECT 'CREATE DATABASE ${database} OWNER ${owner}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${database}')\n\\gexec\nREVOKE ALL ON DATABASE ${database} FROM PUBLIC;\n`);
  }
}
async function provider() {
  const file = join(authRoot, 'downloads', pins.emailOtp.file);
  mkdirSync(join(authRoot, 'downloads'), { recursive: true });
  if (!existsSync(file)) {
    const response = await fetch(pins.emailOtp.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw Error(`Email OTP download HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  if (sha256(readFileSync(file)) !== pins.emailOtp.sha256) throw Error('Email OTP artifact checksum mismatch.');
  return file;
}
function ensureContainer(c, jar, addon) {
  const existing = inspectContainer();
  if (existing) {
    if (existing.ImageDigest !== pins.keycloak.image.split('@')[1]) throw Error('Owned Keycloak container digest differs; inspect before replacing.');
    if (!existing.Config?.Env?.includes('KC_TRUSTSTORE_PATHS=/opt/keycloak/conf/cardford-ca.pem') ||
        !existing.Mounts?.some(x => x.Destination === '/opt/keycloak/themes/cardford') ||
        !existing.Mounts?.some(x => x.Destination === '/opt/keycloak/providers/cardford-email-otp-policy.jar')) {
      // Runtime-only replacement for the approved theme mount; realm data is native PostgreSQL.
      run(podman, ['rm', '--force', containerName]);
    } else {
      if (!existing.State.Running) run(podman, ['start', containerName]);
      return;
    }
  }
  ensureImage(pins.keycloak.image, pins.keycloak.platform);
  const realm = join(authRoot, 'realm.json'); jsonFile(realm, realmDefinition(c));
  const envFile = join(authRoot, 'keycloak.env');
  writeFileSync(envFile, [
    'KC_DB=postgres', 'KC_DB_USERNAME=cardford_auth_keycloak', `KC_DB_PASSWORD=${c.keycloak.databasePassword}`,
    'KC_DB_URL=jdbc:postgresql://cardford-db:54332/cardford_auth_keycloak?sslmode=verify-full&sslrootcert=/opt/keycloak/conf/cardford-ca.pem',
    'KC_HTTP_ENABLED=true', 'KC_HTTP_HOST=0.0.0.0', 'KC_HTTP_PORT=8080', 'KC_HOSTNAME=https://localhost:8443',
    'KC_PROXY_HEADERS=xforwarded', 'KC_PROXY_TRUSTED_ADDRESSES=127.0.0.1/8,10.0.0.0/8',
    'KC_HEALTH_ENABLED=true', 'KC_FEATURES=recovery-codes',
    'KC_TRUSTSTORE_PATHS=/opt/keycloak/conf/cardford-ca.pem',
    `KC_BOOTSTRAP_ADMIN_USERNAME=${c.keycloak.adminUsername}`, `KC_BOOTSTRAP_ADMIN_PASSWORD=${c.keycloak.adminPassword}`,
    'JAVA_OPTS_KC_HEAP=-Xms128m -Xmx512m',
  ].join('\n') + '\n', { mode: 0o600 });
  run(podman, ['run', '-d', '--name', containerName, '--label', `${ownerLabel}=${authRoot}`, '--restart', 'unless-stopped',
    '--publish', '127.0.0.1:8180:8080', '--add-host', `cardford-db:${c.resources.gateway}`, '--env-file', envFile,
    '--volume', `${jar}:/opt/keycloak/providers/${pins.emailOtp.file}:ro`, '--volume', `${c.caFile}:/opt/keycloak/conf/cardford-ca.pem:ro`,
    '--volume', `${addon}:/opt/keycloak/providers/cardford-email-otp-policy.jar:ro`,
    '--volume', `${join(root, 'infra/keycloak/theme/cardford')}:/opt/keycloak/themes/cardford:ro`,
    '--volume', `${realm}:/opt/keycloak/data/import/cardford-realm.json:ro`, pins.keycloak.image,
    'start', '--import-realm', '--spi-theme--static-max-age=-1', '--spi-theme--cache-themes=false', '--spi-theme--cache-templates=false'], { timeout: 90_000 });
}
export async function setup({ trust = false, refreshNetwork = false } = {}) {
  if (process.platform !== 'win32') throw Error('Local auth foundation requires native Windows.');
  if (!existsSync(join(pgbin, 'postgres.exe'))) throw Error('Run native windows:setup first.');
  run(process.execPath, ['scripts/windows-env.mjs', 'status']);
  mkdirSync(authRoot, { recursive: true }); secureDirectory();
  const network = machineNetwork();
  let c;
  if (existsSync(configFile)) {
    c = config();
    if (c.resources.gateway !== network.gateway || c.resources.vmAddress !== network.vmAddress) {
      if (!refreshNetwork) throw Error('WSL route changed: dev:auth:stop, then dev:auth:setup -- --refresh-network.');
      const owned = inspectContainer();
      const pgStatus = spawnSync(join(pgbin, 'pg_ctl.exe'), ['-D', join(authRoot, 'postgres/data'), 'status'], { windowsHide: true, timeout: 5000 });
      if (owned?.State.Running || pgStatus.status === 0) throw Error('Network refresh requires stopped auth PostgreSQL and Keycloak; run dev:auth:stop first.');
      if (owned) run(podman, ['rm', containerName]);
      Object.assign(c.resources, network); jsonFile(configFile, c);
    }
  } else {
    const appPassword = secret();
    c = { schemaVersion: 1, address: '127.0.0.1:4179', origin: 'https://localhost:4443', issuer: 'https://localhost:8443/realms/cardford',
      clientId: 'cardford', clientSecret: secret(), databaseUrl: `postgres://cardford_auth_app:${appPassword}@127.0.0.1:54332/cardford_auth_local_dev?sslmode=require`,
      testDatabaseUrl: `postgres://cardford_auth_app:${appPassword}@127.0.0.1:54332/cardford_auth_local_test?sslmode=require`,
      migrationsDirectory: join(root, 'web/server/records/migrations'), caFile: join(authRoot, 'tls/ca.pem'),
      tls: { certFile: join(authRoot, 'tls/server.pem'), keyFile: join(authRoot, 'tls/server-key.pem') },
      resources: { root: authRoot, container: containerName, pgPort: 54332, pgPassword: secret(), appPassword, ...network },
      keycloak: { adminUsername: 'cardford-local-admin', adminPassword: secret(), databasePassword: secret() },
      email: { smtpPort: 1026, inboxOrigin: 'http://127.0.0.1:8026' }, controlToken: secret(),
    };
    jsonFile(configFile, c);
  }
  provisionTokenKey(c); jsonFile(configFile, c);
  certificates(c); ensurePostgres(c); const jar = await provider(); const addon = await buildOtp(); ensureContainer(c, jar, addon);
  if (trust) run('certutil.exe', ['-user', '-addstore', 'Root', c.caFile]);
  console.log('Auth setup complete: isolated native PostgreSQL 54332; digest-pinned Keycloak 8180. Start dev:auth for local HTTPS and email.');
  if (!trust) console.log(`Browser trust is opt-in: npm run dev:auth:setup -- --trust (CurrentUser CA only). CA: ${c.caFile}`);
  return c;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await setup({ trust: process.argv.includes('--trust'), refreshNetwork: process.argv.includes('--refresh-network') });
}
