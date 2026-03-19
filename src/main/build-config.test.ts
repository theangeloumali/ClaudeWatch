import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

describe('electron-builder mac entitlements', () => {
  it('should sign the main macOS app with the shared entitlements file', async () => {
    const configPath = resolve(process.cwd(), 'electron-builder.yml')
    const config = await readFile(configPath, 'utf-8')

    expect(config).toMatch(
      /\nmac:\n(?:[ \t].*\n)*[ \t]+entitlements:\s+build\/entitlements\.mac\.plist\b/
    )
    expect(config).toMatch(
      /\nmac:\n(?:[ \t].*\n)*[ \t]+entitlementsInherit:\s+build\/entitlements\.mac\.plist\b/
    )
  })
})
