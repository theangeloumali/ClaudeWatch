import { expect, it } from 'vitest'
import { INITIAL_OFFICE_STATE, officeReducer } from '../../logic/office-reducer'

it('requests a reference reset without losing selected identity or changing the frame', () => {
  const state = {
    ...INITIAL_OFFICE_STATE,
    selectedAgentKey: 'opencode:example',
    focusedZoneId: 'company:example',
    isCameraManuallyOwned: true,
    isWalking: true
  }
  const reset = officeReducer(state, { type: 'camera-reset' })
  expect(reset).toMatchObject({
    selectedAgentKey: state.selectedAgentKey,
    focusedZoneId: null,
    isCameraManuallyOwned: false,
    isWalking: false,
    viewMode: 'office',
    cameraRequest: { kind: 'reset', nonce: 1 }
  })
  expect(reset.frame).toBe(state.frame)
})

it('repeated reset requests receive a new nonce rather than being ignored', () => {
  const first = officeReducer(INITIAL_OFFICE_STATE, { type: 'camera-reset' })
  const second = officeReducer(first, { type: 'camera-reset' })
  expect(second.cameraRequest).toMatchObject({ kind: 'reset', nonce: 2 })
})
