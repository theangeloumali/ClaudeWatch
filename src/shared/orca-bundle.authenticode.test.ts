import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createOrcaTrust, orcaBundle } from './orca-bundle'

const installed = orcaBundle('win32')
const check = (cli: string): Promise<void> => createOrcaTrust(Date.now, { ...installed, cli })()

// The real Get-AuthenticodeSignature against copies anyone can make.
describe.runIf(process.platform === 'win32' && existsSync(installed.cli))(
  'the Authenticode check, run by PowerShell itself',
  () => {
    let scratch: string

    beforeAll(async () => {
      scratch = await mkdtemp(join(tmpdir(), 'cw-orca-'))
    })
    afterAll(() => rm(scratch, { recursive: true, force: true }))

    it('passes the Orca that is installed here', async () => {
      await expect(createOrcaTrust(Date.now, installed)()).resolves.toBeUndefined()
    }, 20_000)

    it('refuses an unsigned file named like the CLI', async () => {
      const unsigned = join(scratch, 'unsigned.exe')
      await writeFile(unsigned, 'MZ not a signed program')
      await expect(check(unsigned)).rejects.toThrow('not validly signed')
    }, 20_000)

    it('refuses the CLI with one byte changed', async () => {
      const tampered = join(scratch, 'tampered.exe')
      const bytes = await readFile(installed.cli)
      bytes[0x2000] ^= 0xff
      await writeFile(tampered, bytes)
      await expect(check(tampered)).rejects.toThrow('not validly signed')
    }, 20_000)

    it('refuses a program validly signed by someone else', async () => {
      const otherSigner = join(scratch, 'node.exe')
      await copyFile(process.execPath, otherSigner)
      await expect(check(otherSigner)).rejects.toThrow('not signed for Orca')
    }, 20_000)
  }
)
