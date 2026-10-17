import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountRef, FeedMessage, SessionRef } from '../../../shared/office/types'
import { createLiveFeed, type FeedSource } from '../../office-live/live-feed'
import { buildOfficeLabels } from '../logic/office-labels'
import {
  createOfficeSettingsStore,
  OFFICE_SETTINGS_STORAGE_KEY,
  officeSettings
} from '../logic/office-settings'
import { OfficeApp } from '../OfficeApp'
import type OfficeScene from '../scene/OfficeScene'
import { makeSession } from './fixtures'

type SceneProps = ComponentProps<typeof OfficeScene>

const { signTexture } = vi.hoisted(() => ({ signTexture: vi.fn() }))

vi.mock('../webgl-support', () => ({ canCreateWebGL2: () => true }))
// The stand-in paints each label a theme puts on a sign, and mounts the real card and name layers.
vi.mock('../scene/OfficeScene', async () => {
  const { NameCardLayer } = await import('../scene/NameCards')
  const { OfficeNameLayer } = await import('../scene/OfficeNames')
  return {
    default: (props: SceneProps) => {
      for (const floor of [...props.visibleFloors, ...props.allFloors]) {
        signTexture(floor.label)
        for (const room of floor.rooms) signTexture(room.label)
        const visit = (zone: (typeof floor.zones)[number]): void => {
          signTexture(zone.label)
          zone.children.forEach(visit)
        }
        floor.zones.forEach(visit)
      }
      return (
        <div>
          <p>Scene drawn</p>
          <button type="button" onClick={() => props.onSelectAgent(props.agents[0]?.agentKey)}>
            Pick the first agent
          </button>
          <NameCardLayer
            cards={props.cards}
            stacks={props.stacks}
            onFlyToZone={props.onFlyToZone}
            reviewableKeys={props.reviewableKeys}
            onReview={props.onReview}
            band="desk"
            selectedAgentKey={props.selectedAgentKey}
            anchors={{ cards: new Map(), dots: new Map(), stacks: new Map() }}
          />
          <OfficeNameLayer
            labels={props.visibleFloors.flatMap((floor) => buildOfficeLabels(floor))}
            anchors={new Map()}
          />
        </div>
      )
    }
  }
})

const REAL_NAMES = /Acme Labs|Rocket App|rocket-fix|rocket-reviewer|Acme Holdings/

const ACCOUNTS: AccountRef[] = [
  {
    key: 'claude:acct',
    provider: 'claude',
    label: 'Acme Holdings',
    plan: 'Max 20x',
    isActive: true
  }
]

const SESSIONS: SessionRef[] = [
  makeSession({
    key: 'claude:a',
    sessionId: 'a',
    name: 'rocket-fix',
    cwd: '/Users/ada/Acme Labs/Rocket App/.claude/.worktree/rocket-fix',
    projectRoot: '/Users/ada/Acme Labs/Rocket App',
    worktree: '/Users/ada/Acme Labs/Rocket App/.claude/.worktree/rocket-fix',
    companyKey: 'c_acme',
    companyLabel: 'Acme Labs',
    projectKey: 'p_rocket',
    projectLabel: 'Rocket App',
    accountKey: 'claude:acct',
    accountConfidence: 'exact',
    observation: undefined,
    subagents: [
      {
        id: 'm1',
        type: 'general-purpose',
        kind: 'teammate',
        name: 'rocket-reviewer',
        activity: 'editing'
      }
    ]
  })
]

function liveFeed() {
  const bridge = { send: (_message: FeedMessage): void => undefined }
  const source: FeedSource = {
    ready: () => Promise.resolve(),
    onFeedMessage: (listener) => {
      bridge.send = listener
      return () => undefined
    },
    focus: vi.fn(),
    send: vi.fn(),
    respond: vi.fn(),
    peek: vi.fn(),
    start: vi.fn()
  }
  const feed = createLiveFeed(source, { storage: null })
  const hello = (): void =>
    act(() =>
      bridge.send({
        type: 'hello',
        v: 1,
        snapshot: {
          rev: 1,
          generatedAtMs: Date.now(),
          sessions: SESSIONS,
          sources: [],
          accounts: ACCOUNTS
        }
      })
    )
  return { feed, hello }
}

// Every text node, attribute and form value a person or a screen reader could meet.
function shownText(root: Element): string {
  const parts = [root.textContent ?? '']
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) parts.push(attribute.value)
    if (element instanceof HTMLInputElement) parts.push(element.value)
  }
  return parts.join('\n')
}

async function openOffice() {
  const { feed, hello } = liveFeed()
  render(<OfficeApp feed={feed} />)
  hello()
  await screen.findByText('Scene drawn', {}, { timeout: 3000 })
  return feed
}

function setHideNames(isOn: boolean): void {
  fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
  const toggle = screen.getByRole('switch', { name: 'Hide names' })
  // Paints from here on are the ones the switch caused.
  signTexture.mockClear()
  if (toggle.getAttribute('aria-checked') !== String(isOn)) fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
}

beforeEach(() => {
  localStorage.clear()
  officeSettings.reset()
  signTexture.mockClear()
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the Hide names setting', () => {
  it('turning Hide names on mid-session leaves no real name in the DOM, cards, mini-map or sign textures', async () => {
    const feed = await openOffice()
    fireEvent.click(screen.getByRole('button', { name: 'Pick the first agent' }))
    fireEvent.click(screen.getByText('More controls', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }))
    const editor = screen.getByRole('dialog', { name: 'Edit layout' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Preview' }))
    // Before: the real names are on screen, so the check below can see a leak.
    expect(shownText(document.body)).toMatch(/Acme Holdings/)
    expect(shownText(editor)).toMatch(/Rocket App|rocket-fix/)
    expect(signTexture.mock.calls.flat().join('\n')).toMatch(REAL_NAMES)

    setHideNames(true)

    const painted = signTexture.mock.calls.map(([label]) => String(label))
    expect(painted.length).toBeGreaterThan(0)
    expect(painted.filter((label) => REAL_NAMES.test(label))).toEqual([])
    expect(shownText(document.body).match(REAL_NAMES)).toBeNull()
    expect(screen.getByRole('region', { name: 'Minimap' }).textContent).toMatch(/Project A-1/)
    expect(shownText(screen.getByRole('dialog', { name: 'Edit layout' }))).toMatch(/Project A-1/)
    expect(screen.getByText(/Account 1/)).toBeInTheDocument()
    // The saved city keeps its real names.
    const saved = JSON.stringify(feed.getWorldDocumentStore?.()?.get().document)
    expect(saved).toContain('Rocket App')
    expect(saved).not.toMatch(/Company A|Project A-1/)
  })

  it('it persists across a reload', async () => {
    await openOffice()
    setHideNames(true)
    expect(officeSettings.get().hideNames).toBe(true)
    cleanup()

    // A reload builds its store from what this page saved.
    expect(createOfficeSettingsStore(localStorage).get().hideNames).toBe(true)
    expect(JSON.parse(localStorage.getItem(OFFICE_SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      hideNames: true
    })
    await openOffice()
    expect(shownText(document.body).match(REAL_NAMES)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Settings/ }))
    expect(screen.getByRole('switch', { name: 'Hide names' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })
})
