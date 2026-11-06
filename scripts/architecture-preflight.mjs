#!/usr/bin/env node
/**
 * Read-only setup inventory for the extracted Virtual Live package.
 *
 * The checkout depends on a larger DSH Harness workspace. This script reports
 * which referenced files are present, which point outside the checkout, and
 * whether a verified compatible fixture is recorded. It does not install,
 * compile, run tests, contact a service, or modify the checkout.
 *
 * Exit codes: 0 = no blockers, 2 = setup is blocked, 1 = invalid invocation or
 * inspection error. Missing generated artifacts are reported separately and do
 * not block a pre-build inspection.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jsonOutput = process.argv.slice(2).includes('--json')
const unknown = process.argv.slice(2).filter((arg) => arg !== '--json' && arg !== '--help')

if (unknown.length > 0) {
  console.error(`architecture-preflight: unknown argument ${JSON.stringify(unknown[0])}`)
  console.error('usage: node scripts/architecture-preflight.mjs [--json]')
  process.exit(1)
}

if (process.argv.slice(2).includes('--help')) {
  console.log('usage: node scripts/architecture-preflight.mjs [--json]')
  console.log('Read-only inventory of the extracted Virtual Live setup. Exit 2 means blocked.')
  process.exit(0)
}

/** @typedef {{ level: 'blocker' | 'warning', code: string, message: string, path?: string }} Finding */

/** @type {Finding[]} */
const findings = []
/** @type {string[]} */
const checks = []

/** @param {string} code @param {string} message @param {string} [path] */
function block(code, message, path) {
  findings.push({ level: 'blocker', code, message, ...(path === undefined ? {} : { path }) })
}

/** @param {string} code @param {string} message @param {string} [path] */
function warn(code, message, path) {
  findings.push({ level: 'warning', code, message, ...(path === undefined ? {} : { path }) })
}

/** @param {string} path */
function exists(path) {
  return existsSync(path)
}

/** @param {string} path */
function isOutside(path) {
  const rel = relative(root, path)
  return rel.startsWith('..') || isAbsolute(rel)
}

/** Strip comments and trailing commas from a JSON-with-comments file. @param {string} input */
function stripJsonComments(input) {
  let out = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      while (index < input.length && input[index] !== '\n') index += 1
      out += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) index += 1
      index += 1
      continue
    }
    out += char
  }
  return out.replace(/,\s*([}\]])/g, '$1')
}

/** @param {string} path */
async function readJsonc(path) {
  const text = await readFile(path, 'utf8')
  return JSON.parse(stripJsonComments(text))
}

/** @param {string} file @param {string} specifier */
function resolveRelative(file, specifier) {
  if (!specifier.startsWith('.')) return undefined
  const target = resolve(dirname(file), specifier)
  return target
}

/** @param {string} target */
function targetExists(target) {
  return exists(target) || exists(`${target}.ts`) || exists(`${target}.tsx`) || exists(`${target}.js`)
}

/** @param {string} message */
function note(message) {
  checks.push(message)
}

try {
  note(`checkout ${root}`)

  const manifestPath = join(root, 'package.json')
  if (!exists(manifestPath)) {
    block('missing-package', 'package.json is missing', 'package.json')
  } else {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const scripts = manifest.scripts ?? {}
    if (typeof scripts.bundle !== 'string' || typeof scripts.watch !== 'string') {
      warn('package-scripts', 'package.json does not declare both bundle and watch scripts', 'package.json')
    }
    if (typeof manifest.exports?.['./src/*'] !== 'string') {
      warn('source-export', 'package.json no longer exposes ./src/*; audit external consumers before removing it', 'package.json')
    }
    const workspaceDependencies = Object.entries({
      ...(manifest.dependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    }).filter(([, value]) => typeof value === 'string' && value.startsWith('workspace:'))
    if (workspaceDependencies.length > 0) {
      warn(
        'workspace-dependencies',
        `${workspaceDependencies.length} dependencies use workspace ranges and resolve only inside a compatible Harness checkout`,
        'package.json',
      )
    }
    note(`package declares ${Object.keys(scripts).length} scripts`)
  }

  const requiredFiles = [
    'README.md',
    'src/index.ts',
    'src/types.ts',
    'src/client/index.ts',
    'assets/phone-worker.py',
    'assets/artwork.json',
  ]
  for (const file of requiredFiles) {
    if (!exists(join(root, file))) block('missing-file', `${file} is missing`, file)
  }
  if (!exists(join(root, 'src/client/assets'))) {
    block('missing-assets', 'src/client/assets is missing', 'src/client/assets')
  } else {
    const images = (await readdir(join(root, 'src/client/assets'))).filter((file) => file.endsWith('.png'))
    if (images.length === 0) warn('empty-assets', 'src/client/assets contains no PNG artwork', 'src/client/assets')
    else note(`browser assets ${images.length}`)
  }

  for (const config of [
    { file: 'tsconfig.host.json', label: 'Host' },
    { file: 'tsconfig.client.json', label: 'Client' },
  ]) {
    const path = join(root, config.file)
    if (!exists(path)) {
      block('missing-config', `${config.file} is missing`, config.file)
      continue
    }
    const parsed = await readJsonc(path)
    const extendTarget = typeof parsed.extends === 'string' ? resolve(root, parsed.extends) : undefined
    if (extendTarget !== undefined && !exists(extendTarget)) {
      block(
        'missing-config-target',
        `${config.label} config extends ${parsed.extends}, which is outside this checkout and missing`,
        config.file,
      )
    }
    const inputs = [...(parsed.files ?? []), ...(parsed.include ?? [])].filter((entry) => typeof entry === 'string')
    for (const input of inputs) {
      if (input.includes('*')) continue
      if (!exists(join(root, input))) block('missing-config-input', `${config.file} references missing ${input}`, input)
    }
    note(`${config.label} config ${parsed.references?.length ?? 0} references`)
  }

  const bundlerPath = join(root, 'tsdown.config.ts')
  if (!exists(bundlerPath)) {
    block('missing-bundler', 'tsdown.config.ts is missing', 'tsdown.config.ts')
  } else {
    const bundler = await readFile(bundlerPath, 'utf8')
    for (const match of bundler.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = resolveRelative(bundlerPath, match[1])
      if (target === undefined) continue
      if (!targetExists(target)) {
        block(
          'missing-bundler-helper',
          `bundler imports ${match[1]}, which is outside this checkout and missing`,
          'tsdown.config.ts',
        )
      }
    }
  }

  const testsDir = join(root, 'tests')
  if (!exists(testsDir)) {
    warn('missing-tests', 'tests/ is missing', 'tests')
  } else {
    const testFiles = (await readdir(testsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      .map((entry) => join(testsDir, entry.name))
    let externalImports = 0
    for (const file of testFiles) {
      const text = await readFile(file, 'utf8')
      for (const match of text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const target = resolveRelative(file, match[1])
        if (target === undefined) continue
        if (!targetExists(target)) {
          block('missing-test-import', `${relative(root, file)} imports missing ${match[1]}`, relative(root, file))
          if (isOutside(target)) externalImports += 1
        }
      }
    }
    note(`test files ${testFiles.length}; external missing imports ${externalImports}`)
  }

  const lockPath = join(root, 'dev/harness.lock.json')
  if (!exists(lockPath)) {
    block('missing-harness-pin', 'dev/harness.lock.json is absent; no compatible Harness revision is recorded')
  } else {
    let pin
    try {
      pin = JSON.parse(await readFile(lockPath, 'utf8'))
    } catch (error) {
      block('invalid-harness-pin', `dev/harness.lock.json is not valid JSON: ${String(error)}`)
    }
    if (pin !== undefined) {
      if (pin.schemaVersion !== 1) block('invalid-harness-pin', 'dev/harness.lock.json schemaVersion must be 1')
      if (typeof pin.repository !== 'string' || pin.repository.length === 0) {
        block('invalid-harness-pin', 'dev/harness.lock.json must name the Harness repository')
      }
      if (typeof pin.commit !== 'string' || !/^[0-9a-f]{40}$/.test(pin.commit)) {
        block('unverified-harness-pin', 'dev/harness.lock.json must record a full 40-character Harness commit')
      }
      if (typeof pin.packagePath !== 'string' || pin.packagePath.length === 0) {
        block('invalid-harness-pin', 'dev/harness.lock.json must record the integrated packagePath')
      }
      if (typeof pin.nodeVersion !== 'string' || pin.nodeVersion.length === 0) {
        block('invalid-harness-pin', 'dev/harness.lock.json must record the tested Node version')
      }
      if (typeof pin.packageManager !== 'string' || pin.packageManager.length === 0) {
        block('invalid-harness-pin', 'dev/harness.lock.json must record the tested package manager')
      }
      if (!Array.isArray(pin.verifiedCommands) || pin.verifiedCommands.length === 0) {
        block('unverified-harness-pin', 'dev/harness.lock.json must list verifiedCommands after a successful clean setup')
      }
    }
  }

  const generated = [
    'lib/index.js',
    'lib/client.js',
    'lib/typert.host.js',
    'lib/typert.remote-client.js',
    'lib/types/index.d.ts',
  ]
  const missingGenerated = generated.filter((file) => !exists(join(root, file)))

  const blockers = findings.filter((finding) => finding.level === 'blocker')
  const warnings = findings.filter((finding) => finding.level === 'warning')
  const status = blockers.length === 0 ? 'ok' : 'blocked'

  if (jsonOutput) {
    console.log(JSON.stringify({
      schemaVersion: 1,
      root,
      status,
      checks,
      blockers,
      warnings,
      generated: { expected: generated, missing: missingGenerated },
    }, null, 2))
  } else {
    console.log('Virtual Live setup preflight')
    console.log(`Root: ${root}`)
    console.log(`Status: ${status.toUpperCase()} (${blockers.length} blockers, ${warnings.length} warnings)`)
    if (blockers.length > 0) {
      console.log('\nBlockers')
      for (const finding of blockers) console.log(`  [${finding.code}] ${finding.message}`)
    }
    if (warnings.length > 0) {
      console.log('\nWarnings')
      for (const finding of warnings) console.log(`  [${finding.code}] ${finding.message}`)
    }
    console.log(`\nGenerated artifacts: ${missingGenerated.length === 0 ? 'present' : `absent (${missingGenerated.length}); expected before a build`}`)
    console.log('This inventory does not establish that installation, compilation, tests, or runtime behavior pass.')
  }

  process.exitCode = status === 'ok' ? 0 : 2
} catch (error) {
  console.error(`architecture-preflight: inspection failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  process.exitCode = 1
}
