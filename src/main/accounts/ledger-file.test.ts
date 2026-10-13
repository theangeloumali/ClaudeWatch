// @vitest-environment node
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadLedger, saveLedger } from './ledger-file'
import { BEYOND_ANY_LINE, emptyLedger, type LedgerState } from './ledger-state'

const counts = (output: number) => ({ input: 1, output, cacheWrite: 2, cacheRead: 3 })
const limit = {
  windowMinutes: 300,
  scope: null,
  usedPercent: 40,
  resetsAtMs: null,
  source: 'orca-cache' as const,
  fetchedAtMs: 5_000
}
function filledLedger(): LedgerState {
  return {
    ...emptyLedger(1_000),
    sampledAtMs: 9_000,
    codexDefaultKey: 'codex:bbbbbbbbbbbb',
    accounts: [
      {
        key: 'claude:aaaaaaaaaaaa',
        provider: 'claude',
        email: 'ada@example.test',
        organizationUuid: 'org-ada',
        organizationName: 'Ada Labs',
        plan: 'max',
        alias: 'Work',
        orcaAccountId: 'orca-1',
        sources: ['default-login', 'orca'],
        firstSeenMs: 2_000
      }
    ],
    spans: [
      { accountKey: 'claude:aaaaaaaaaaaa', fromMs: 2_000, toMs: 4_000 },
      { accountKey: 'claude:aaaaaaaaaaaa', fromMs: 6_000, toMs: null }
    ],
    buckets: new Map([
      [
        'claude:aaaaaaaaaaaa|2026-10-11|p_1|inferred',
        {
          accountKey: 'claude:aaaaaaaaaaaa',
          day: '2026-10-11',
          projectKey: 'p_1',
          confidence: 'inferred' as const,
          counts: counts(9)
        }
      ],
      [
        '|2026-10-11|p_1|unattributed',
        {
          accountKey: null,
          day: '2026-10-11',
          projectKey: 'p_1',
          confidence: 'unattributed' as const,
          counts: counts(4)
        }
      ]
    ]),
    projects: new Map([['p_1', 'repo']]),
    files: new Map([
      ['file-id', { atMs: 7_000, position: 420 }],
      // Counted before positions were kept.
      ['older-file-id', { atMs: 6_000, position: BEYOND_ANY_LINE }]
    ]),
    codexSessions: new Map([['codex:c', { counts: counts(5), countedAtMs: 8_000 }]]),
    limits: new Map([['claude:aaaaaaaaaaaa', [limit]]])
  }
}

let folder: string
let path: string
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'cw-ledger-'))
  path = join(folder, 'accounts-ledger.json')
})
afterEach(async () => {
  await chmod(folder, 0o700)
  await rm(folder, { recursive: true, force: true })
})
const mode = async (file: string): Promise<number> => (await stat(file)).mode & 0o777
// Windows has no POSIX mode bits: there the profile folder's ACL keeps the ledger private.
const hasModeBits = process.platform !== 'win32'
const expectOwnerOnly = async (file: string): Promise<void> => {
  if (hasModeBits) expect(await mode(file)).toBe(0o600)
}

describe('saveLedger', () => {
  it('writes a file only its owner can read, and reads the same ledger back', async () => {
    saveLedger(path, filledLedger())
    await expectOwnerOnly(path)
    expect(loadLedger(path)).toEqual(filledLedger())
    expect(await readdir(folder)).toEqual(['accounts-ledger.json'])
  })

  it('replaces a file that was readable by others with one that is not', async () => {
    await writeFile(path, '{}', { mode: 0o644 })
    saveLedger(path, filledLedger())
    await expectOwnerOnly(path)
  })

  it('does not write through a link left where its temporary file goes', async () => {
    const victim = join(folder, 'victim')
    await writeFile(victim, 'KEEP')
    await symlink(victim, `${path}.${process.pid}.tmp`)
    saveLedger(path, filledLedger())
    expect(await readFile(victim, 'utf8')).toBe('KEEP')
    expect(loadLedger(path)).toEqual(filledLedger())
    expect((await readdir(folder)).sort()).toEqual(['accounts-ledger.json', 'victim'])
  })

  const expectWriteFailureKeepsLedger = async (
    breakWrite: () => Promise<unknown>
  ): Promise<void> => {
    saveLedger(path, filledLedger())
    const before = await readFile(path, 'utf8')
    await breakWrite()
    expect(() => saveLedger(path, emptyLedger(5))).toThrow()
    expect(await readFile(path, 'utf8')).toBe(before)
  }

  // Windows cannot make a folder read-only; the case below fails a write on every platform.
  it.skipIf(!hasModeBits)('leaves the previous ledger whole when its folder is read-only', () =>
    expectWriteFailureKeepsLedger(() => chmod(folder, 0o500))
  )

  it('leaves the previous ledger whole when a folder holds its temporary name', () =>
    expectWriteFailureKeepsLedger(() =>
      mkdir(join(`${path}.${process.pid}.tmp`, 'x'), { recursive: true })
    ))
})

describe('loadLedger', () => {
  const stored = async (): Promise<Record<string, unknown>> => {
    saveLedger(path, filledLedger())
    return JSON.parse(await readFile(path, 'utf8'))
  }

  it('finds no ledger where none was saved, and creates nothing', async () => {
    expect(loadLedger(path)).toBeNull()
    expect(await readdir(folder)).toEqual([])
  })

  it.each([
    ['text that is not JSON', '{"version":1,"trackingSinceMs":'],
    ['a list', '[]'],
    ['a version it does not know', JSON.stringify({ version: 2, trackingSinceMs: 1 })],
    ['no tracking start', JSON.stringify({ version: 1, trackingSinceMs: 'yesterday' })]
  ])(
    'starts empty from %s, and sets the file aside instead of overwriting it',
    async (_case, text) => {
      await writeFile(path, text, { mode: 0o600 })
      expect(loadLedger(path)).toBeNull()
      expect(await readFile(`${path}.damaged`, 'utf8')).toBe(text)
      await expectOwnerOnly(`${path}.damaged`)
      expect(await readdir(folder)).toEqual(['accounts-ledger.json.damaged'])
    }
  )

  it('sets aside, unread, a ledger that is not a regular file or is larger than a ledger gets', async () => {
    await mkdir(path)
    expect(loadLedger(path)).toBeNull()
    expect(await readdir(folder)).toEqual(['accounts-ledger.json.damaged'])
    await rm(`${path}.damaged`, { recursive: true })
    await writeFile(path, ' '.repeat(16 * 1024 * 1024 + 1))
    expect(loadLedger(path)).toBeNull()
    expect(await readdir(folder)).toEqual(['accounts-ledger.json.damaged'])
  })

  it('keeps each file’s time where every version reads it, and its position beside it', async () => {
    const file = await stored()
    expect(file.files).toEqual([
      ['file-id', 7_000],
      ['older-file-id', 6_000]
    ])
    expect(file.filePositions).toEqual([['file-id', 420]])
  })

  it('reads a ledger written before positions were kept, leaving every file to its time alone', async () => {
    const { filePositions: _notYetWritten, ...olderForm } = await stored()
    await writeFile(path, JSON.stringify(olderForm))
    const ledger = loadLedger(path)
    expect([...(ledger?.files ?? [])]).toEqual([
      ['file-id', { atMs: 7_000, position: BEYOND_ANY_LINE }],
      ['older-file-id', { atMs: 6_000, position: BEYOND_ANY_LINE }]
    ])
    expect({ ...ledger, files: null }).toEqual({ ...filledLedger(), files: null })
  })

  it.each([
    ['is negative', -1],
    ['is not whole', 420.5],
    ['is larger than a file gets', Number.MAX_SAFE_INTEGER + 1],
    ['is text', '420'],
    ['is missing', null]
  ])('leaves a file to its time alone when its stored position %s', async (_case, position) => {
    const file = await stored()
    Object.assign(file, {
      filePositions: [['file-id', position], ['never-counted', 9], 'x']
    })
    await writeFile(path, JSON.stringify(file))
    expect([...(loadLedger(path)?.files ?? [])]).toEqual([
      ['file-id', { atMs: 7_000, position: BEYOND_ANY_LINE }],
      ['older-file-id', { atMs: 6_000, position: BEYOND_ANY_LINE }]
    ])
  })

  it('holds a stored name and every stored key to the rules they were written under', async () => {
    const file = await stored()
    const [account] = file.accounts as Record<string, unknown>[]
    Object.assign(file, {
      codexDefaultKey: 'ada@example.test',
      accounts: [
        { ...account, alias: `${'w'.repeat(417)}\n` },
        { ...account, key: 'ada@example.test' }
      ],
      spans: [{ accountKey: 'ada@example.test', fromMs: 2_000, toMs: null }]
    })
    await writeFile(path, JSON.stringify(file))
    const ledger = loadLedger(path)
    expect(ledger?.accounts).toEqual([{ ...filledLedger().accounts[0], alias: null }])
    expect(ledger?.spans).toEqual([])
    expect(ledger?.codexDefaultKey).toBeNull()
  })

  it('keeps what is sound in a hand-edited file and drops the rest', async () => {
    const file = await stored()
    const [account] = file.accounts as Record<string, unknown>[]
    const [bucket] = file.buckets as Record<string, unknown>[]
    Object.assign(file, {
      unknownSection: { token: 'CANARY' },
      sampledAtMs: 'soon',
      accounts: [{ ...account, token: 'CANARY' }, { ...account, key: 7 }, 'ada'],
      spans: [{ accountKey: 'claude:aaaaaaaaaaaa', fromMs: null, toMs: null }],
      buckets: [
        bucket,
        { ...bucket, projectKey: 'p_2', counts: { ...counts(1), output: '12' } },
        { ...bucket, projectKey: 'p_3', counts: { ...counts(1), input: -5 } },
        { ...bucket, projectKey: 'p_4', confidence: 'certain' },
        { ...bucket, projectKey: 'p_5', day: 'today' }
      ],
      files: [['file-id', 7_000], ['other', null], 'x', ['__proto__', 5]],
      limits: [['claude:aaaaaaaaaaaa', [limit, { ...limit, usedPercent: null }]]]
    })
    await writeFile(path, JSON.stringify(file))
    const ledger = loadLedger(path)
    expect(ledger?.sampledAtMs).toBeNull()
    expect(ledger?.accounts).toEqual(filledLedger().accounts)
    expect(ledger?.spans).toEqual([])
    expect([...(ledger?.buckets.values() ?? [])].map((kept) => kept.projectKey)).toEqual(['p_1'])
    expect([...(ledger?.files ?? [])]).toEqual([
      ['file-id', { atMs: 7_000, position: 420 }],
      ['__proto__', { atMs: 5, position: BEYOND_ANY_LINE }]
    ])
    expect(ledger?.limits.get('claude:aaaaaaaaaaaa')).toEqual([limit])
    expect(JSON.stringify([...(ledger?.accounts ?? [])])).not.toContain('CANARY')
  })
})
