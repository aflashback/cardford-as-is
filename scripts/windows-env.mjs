// Project-local native tools. No WSL/container, global PATH or service changes.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const pins = JSON.parse(readFileSync(join(import.meta.dirname, 'windows-tools.json'), 'utf8'));
if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== pins.node)
    throw Error(`Requires native Windows x64 Node ${pins.node}; got ${process.platform}/${process.arch}/${process.version}`);
const base = resolve('.local/windows-tools'), pgroot = resolve('.local/windows-postgres');
const go = resolve(base, pins.go.executable), cc = resolve(base, pins.cc.executable), pgbin = resolve(base, 'pgsql/bin');
const env = { ...process.env, GOTOOLCHAIN: 'local', GOCACHE: join(base, 'gocache'), GOMODCACHE: join(base, 'gomodcache'), GOOS: 'windows', GOARCH: 'amd64', GOFLAGS: '', CC: cc, CGO_ENABLED: '0', NODE_OPTIONS: '', PATH: [resolve(base, 'go1.26.8/go/bin'), resolve(base, 'llvm-mingw-20260922-ucrt-x86_64/bin'), pgbin, process.env.PATH].join(';') };
env.M02A_GOFMT_COMMAND = JSON.stringify([resolve(base, 'go1.26.8/go/bin/gofmt.exe')]);
function run(exe, args, options = {}) { const r = spawnSync(exe, args, { cwd: root, env, encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20, ...options }); if (r.error)
    throw r.error; if (r.status !== 0)
    throw Error(`${exe.split(/[\\/]/).at(-1)} exited ${r.status}: ${r.stderr ?? ''}`); return r.stdout ?? ''; }
const sha = b => createHash('sha256').update(b).digest('hex');
function versions() { const g = run(go, ['version']).trim(), c = run(cc, ['--version']).split('\n')[0].trim(), p = run(join(pgbin, 'postgres.exe'), ['--version']).trim(); if (g !== `go version ${pins.go.version} windows/amd64` || !c.startsWith(`clang version ${pins.cc.version} `) || p !== `postgres (PostgreSQL) ${pins.postgres.version}`)
    throw Error('Installed native tools do not match pins'); return { node: process.version, nodePath: process.execPath, go: g, compiler: c, postgres: p }; }
async function setup() { mkdirSync(join(base, 'downloads'), { recursive: true }); for (const key of ['go', 'cc', 'postgres']) {
    const pin = pins[key], archive = join(base, 'downloads', pin.archive);
    // An installed, version-checked tool does not need its disposable archive.
    // Keep setup usable offline after comparison/download cleanup.
    if (existsSync(resolve(base, pin.executable)))
        continue;
    if (!existsSync(archive)) {
        const curl = 'C:/Program Files/Git/mingw64/bin/curl.exe';
        if (existsSync(curl)) {
            run(curl, ['-4', '--fail', '--location', '--retry', '2', '--connect-timeout', '30', '--max-time', '300', '--output', archive, pin.url]);
        }
        else {
            const r = await fetch(pin.url, { signal: AbortSignal.timeout(300000) });
            if (!r.ok)
                throw Error(`Download ${key}: HTTP ${r.status}`);
            writeFileSync(archive, Buffer.from(await r.arrayBuffer()));
        }
    }
    if (sha(readFileSync(archive)) !== pin.sha256)
        throw Error(`Checksum mismatch: ${key}; inspect/remove this archive before retrying`);
    if (!existsSync(resolve(base, pin.executable))) {
        const destination = resolve(base, pin.destination);
        mkdirSync(destination, { recursive: true });
        run('tar.exe', ['-xf', archive, '-C', destination, ...(pin.members ?? [])]);
    }
} console.log(JSON.stringify(versions(), null, 2)); }
function credentials() { const file = join(pgroot, 'credentials.json'); if (!existsSync(file))
    throw Error('Run pg:start first'); const c = JSON.parse(readFileSync(file, 'utf8')); if (c.root !== pgroot || c.host !== '127.0.0.1' || c.port !== 54331 || c.user !== 'cardford_local' || c.database !== 'cardford_windows' || c.testDatabase !== 'cardford_windows_test')
    throw Error('Unexpected local cluster identity'); return c; }
function databaseEnvironment(c) { env.PGHOST = c.host; env.PGPORT = String(c.port); env.PGUSER = c.user; env.PGPASSWORD = c.password; env.PGDATABASE = 'postgres'; const prefix = `postgres://${c.user}:${c.password}@${c.host}:${c.port}/`; env.DATABASE_URL = prefix + c.database; env.TEST_DATABASE_URL = prefix + c.testDatabase; env.APP_ENV = 'local'; env.IDENTITY_MODE = 'local-test'; env.BILLING_MODE = 'fixture'; env.JEV_MODE = 'off'; env.JEV_MAX_REQUESTS = '0'; }
function pgStart() { versions(); mkdirSync(pgroot, { recursive: true }); const file = join(pgroot, 'credentials.json'), data = join(pgroot, 'data'); if (!existsSync(file)) {
    if (existsSync(data))
        throw Error('Refusing an unrecognized PostgreSQL data directory');
    writeFileSync(file, JSON.stringify({ root: pgroot, host: '127.0.0.1', port: 54331, user: 'cardford_local', password: randomBytes(24).toString('hex'), database: 'cardford_windows', testDatabase: 'cardford_windows_test' }) + '\n');
} const c = credentials(); databaseEnvironment(c); if (!existsSync(join(data, 'PG_VERSION'))) {
    const pw = join(pgroot, 'init-password.txt');
    writeFileSync(pw, c.password + '\n');
    run(join(pgbin, 'initdb.exe'), ['-D', data, '-U', c.user, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${pw}`]);
    writeFileSync(pw, '');
} const status = spawnSync(join(pgbin, 'pg_ctl.exe'), ['-D', data, 'status'], { env, windowsHide: true, encoding: 'utf8' }); if (status.error)
    throw status.error; if (status.status !== 0)
    run(join(pgbin, 'pg_ctl.exe'), ['-D', data, '-l', join(pgroot, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${c.port}`, '-w', 'start'], { stdio: 'ignore' }); for (const name of [c.database, c.testDatabase]) {
    const present = run(join(pgbin, 'psql.exe'), ['-X', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${name}'`]).trim();
    if (present !== '1')
        run(join(pgbin, 'createdb.exe'), [name]);
} console.log(JSON.stringify({ postgres: pins.postgres.version, host: c.host, port: c.port, databases: [c.database, c.testDatabase], credentials: 'private ignored .local/windows-postgres/credentials.json' })); }
const [command, ...args] = process.argv.slice(2);
if (command === 'setup')
    await setup();
else if (command === 'status')
    console.log(JSON.stringify(versions(), null, 2));
else if (command === 'pg:start')
    pgStart();
else if (command === 'pg:stop') {
    credentials();
    run(join(pgbin, 'pg_ctl.exe'), ['-D', join(pgroot, 'data'), '-m', 'fast', '-w', 'stop']);
    console.log('Native project PostgreSQL stopped.');
}
else if (['go', 'node', 'npm', 'benchmark', 'profiles'].includes(command)) {
    versions();
    if (existsSync(join(pgroot, 'credentials.json')))
        databaseEnvironment(credentials());
    if (command === 'go') {
        if (args.includes('-race'))
            env.CGO_ENABLED = '1';
        run(go, args, { stdio: 'inherit' });
    }
    else if (command === 'node')
        run(process.execPath, args, { stdio: 'inherit' });
    else if (command === 'npm') {
        const npm = resolve(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js');
        run(process.execPath, [npm, ...args], { stdio: 'inherit' });
    }
    else
        run(process.execPath, ['scripts/performance-windows.mjs', `--go=${go}`, `--go-version=${pins.go.version}`, ...(command === 'profiles' ? ['--profiles'] : []), ...args], { stdio: 'inherit' });
}
else
    throw Error('Use setup | status | pg:start | pg:stop | go <args> | node <args> | npm <args> | benchmark [args] | profiles [args]');
