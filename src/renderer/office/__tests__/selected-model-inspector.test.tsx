import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { agentKey } from '../../../shared/office/agent-key'
import type { ProviderId, SessionRef, SubagentRef } from '../../../shared/office/types'
import { Inspector } from '../hud/Inspector'
import { Fact } from '../hud/Fact'
import { makeAgent, makeSession } from './fixtures'

const parentSession = {
  ...makeSession({ key: 'opencode:parent', provider: 'opencode' }),
  selectedModel: { providerId: 'openai', modelId: 'gpt-parent', variant: 'xhigh' }
}

function showInspector(
  options: {
    session?: SessionRef
    member?: SubagentRef
    isSubagent?: boolean
    provider?: ProviderId
  } = {}
): void {
  render(
    <Inspector
      agent={makeAgent({
        agentKey: options.isSubagent ? agentKey('opencode:parent', 'child') : 'opencode:parent',
        provider: options.provider ?? 'opencode',
        isSubagent: options.isSubagent ?? false
      })}
      session={options.session ?? parentSession}
      member={options.member}
      character={null}
      canFly={false}
      onFocusTerminal={() => undefined}
      onFly={() => undefined}
      onClose={() => undefined}
    />
  )
}

function selectedModelText(): string | null {
  return (
    screen.getByText('Selected model', { selector: 'dt' }).nextElementSibling?.textContent ?? null
  )
}

describe('OpenCode selected-model facts', () => {
  it('wraps a long unbroken selected-model ID without truncating its text', () => {
    const modelId = 'm'.repeat(128)
    showInspector({
      session: { ...parentSession, selectedModel: { providerId: 'openai', modelId } }
    })
    const label = screen
      .getByText('Selected model', { selector: 'dt' })
      .nextElementSibling?.querySelector('span')
    expect(label).toHaveTextContent(`openai / ${modelId}`)
    expect(label).toHaveClass('[overflow-wrap:anywhere]')
    expect(label).not.toHaveClass('truncate')
  })

  it('keeps default Fact values truncated unless wrapping is requested', () => {
    render(
      <dl>
        <Fact term="Default fact" value={'p'.repeat(128)} />
      </dl>
    )
    const label = screen
      .getByText('Default fact', { selector: 'dt' })
      .nextElementSibling?.querySelector('span')
    expect(label).toHaveClass('truncate')
    expect(label).not.toHaveClass('[overflow-wrap:anywhere]')
  })

  it('shows the parent selection without relabeling the transport provider', () => {
    showInspector()
    expect(selectedModelText()).toBe('openai / gpt-parent · xhigh')
    expect(screen.getByText('Provider', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      'OpenCode'
    )
  })

  it('shows only the selected child’s model, even when its parent uses another model', () => {
    const child = {
      id: 'child',
      type: 'lena',
      activity: 'reading' as const,
      selectedModel: { providerId: 'openai', modelId: 'gpt-child' }
    }
    showInspector({ isSubagent: true, member: child })
    expect(selectedModelText()).toBe('openai / gpt-child')
    expect(selectedModelText()).not.toContain('gpt-parent')
  })

  it.each([undefined, { id: 'child', type: 'lena', activity: 'idle' as const }])(
    'never borrows the parent model for a child with unavailable metadata',
    (member) => {
      showInspector({ isSubagent: true, member })
      expect(selectedModelText()).toBe('Unavailable')
      expect(selectedModelText()).not.toContain('gpt-parent')
    }
  )

  it('keeps an OpenCode session visible when no selected model was observed', () => {
    showInspector({ session: makeSession({ key: 'opencode:parent', provider: 'opencode' }) })
    expect(selectedModelText()).toBe('Unavailable')
    expect(screen.getByText('Provider', { selector: 'dt' })).toBeInTheDocument()
  })

  it('does not add an unsupported model fact to independent Codex CLI agents', () => {
    showInspector({
      provider: 'codex',
      session: makeSession({ key: 'codex:parent', provider: 'codex' })
    })
    expect(screen.queryByText('Selected model', { selector: 'dt' })).not.toBeInTheDocument()
  })
})
