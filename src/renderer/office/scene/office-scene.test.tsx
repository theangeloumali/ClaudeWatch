import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { makeAgent, makeFloor, makeRoom, makeSession } from '../__tests__/fixtures'
import { buildNameCards } from '../logic/name-cards'
import { themeForTeam } from '../themes/registry'
import OfficeScene from './OfficeScene'
import { SCENE_ROOT_SELECTOR } from './use-camera-gestures'

// The 3D tree needs WebGL; the page structure around it is what is under test.
vi.mock('@react-three/fiber', () => ({
  Canvas: (props: { role?: string; 'aria-label'?: string; children?: ReactNode }) => (
    <div role={props.role} aria-label={props['aria-label']}>
      <canvas />
    </div>
  ),
  useFrame: () => undefined,
  useThree: () => undefined
}))

function renderScene() {
  const session = makeSession({ key: 'claude:a', attention: 'permission' })
  const floor = makeFloor({
    floorId: 'f1',
    label: 'Main',
    rooms: [makeRoom({ id: 'r1', sessionKey: session.key })]
  })
  const agents = [makeAgent({ agentKey: session.key, attention: 'permission' })]
  const frame = { floors: [floor], agents, sessions: [session], connected: true, sources: [] }
  return render(
    <OfficeScene
      theme={themeForTeam()}
      floors={[{ floorId: 'f1', label: 'Main', attentionCount: 1 }]}
      sessions={[session]}
      floor={floor}
      visibleFloors={[floor]}
      allFloors={[floor]}
      agents={agents}
      cards={buildNameCards(frame, 'f1', null)}
      stacks={[]}
      selectedAgentKey={session.key}
      wallsMode="cutaway"
      cameraRequest={null}
      metrics={{ fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 }}
      onSelectAgent={vi.fn()}
      onFlyToAgent={vi.fn()}
      onFlyToZone={vi.fn()}
      reviewableKeys={new Set([session.key])}
      onReview={vi.fn()}
      speakingAgentKey={null}
    />
  )
}

// The card layer is aria-hidden by design, so its buttons are looked up as hidden ones.
const cardButtons = (): HTMLElement[] => screen.getAllByRole('button', { hidden: true })

it('puts the image role on the canvas, not around the card buttons', () => {
  renderScene()
  const picture = screen.getByRole('img', { name: 'Isometric view of 1 physical office floor' })
  const buttons = cardButtons()
  expect(buttons.map((button) => button.textContent)).toContain('Review')
  for (const button of buttons) expect(picture.contains(button)).toBe(false)
})

it('keeps the canvas and the card buttons inside the root the camera gestures listen on', () => {
  const { container } = renderScene()
  const root = container.querySelector(SCENE_ROOT_SELECTOR)
  expect(root?.contains(container.querySelector('canvas'))).toBe(true)
  for (const button of cardButtons()) expect(root?.contains(button)).toBe(true)
})
