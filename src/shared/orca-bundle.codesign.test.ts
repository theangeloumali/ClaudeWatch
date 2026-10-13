import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { orcaBundle, ORCA_TEAM_ID, verifyArgs } from './orca-bundle'

const ORCA_APP = orcaBundle('darwin').app

const CODESIGN = '/usr/bin/codesign'
const codesign = (args: string[]): { status: number | null; stderr: string } =>
  spawnSync(CODESIGN, args, { encoding: 'utf8', env: { LC_ALL: 'C' } })

// The real codesign against a bundle anyone can make: signed ad hoc (no certificate), with an
// identifier that carries a line break and a forged "TeamIdentifier=" line.
describe.runIf(process.platform === 'darwin' && existsSync(CODESIGN))(
  'the signing requirement, run by codesign itself',
  () => {
    let scratch: string
    let forged: string

    beforeAll(async () => {
      scratch = await mkdtemp(join(tmpdir(), 'cw-forged-'))
      forged = join(scratch, 'Fake.app')
      await mkdir(join(forged, 'Contents', 'MacOS'), { recursive: true })
      await cp('/usr/bin/true', join(forged, 'Contents', 'MacOS', 'Fake'))
      await writeFile(
        join(forged, 'Contents', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Fake</string>
<key>CFBundleIdentifier</key><string>com.example.fake</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`
      )
      const identifier = `com.example.fake\nTeamIdentifier=${ORCA_TEAM_ID}`
      const signed = codesign(['--force', '--sign', '-', '--identifier', identifier, forged])
      if (signed.status !== 0) throw new Error('could not sign the scratch bundle ad hoc')
    })

    afterAll(() => rm(scratch, { recursive: true, force: true }))

    it('is the kind of bundle the old check accepted: sealed, and describing itself as Orca’s team', () => {
      expect(codesign(['--verify', '--deep', '--strict', forged]).status).toBe(0)
      expect(codesign(['-dv', forged]).stderr.split('\n')).toContain(
        `TeamIdentifier=${ORCA_TEAM_ID}`
      )
    })

    it('refuses that bundle', () => {
      const verdict = codesign(verifyArgs(forged))
      expect(verdict.status).not.toBe(0)
      expect(verdict.stderr).toContain('failed to satisfy specified code requirement')
    })

    it.runIf(existsSync(ORCA_APP))('passes the Orca that is installed here', () => {
      expect(codesign(verifyArgs(ORCA_APP)).status).toBe(0)
    })
  }
)
