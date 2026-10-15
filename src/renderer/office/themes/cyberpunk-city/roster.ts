import type { ProviderId } from '../../../../shared/office/types'
import { makeRoster } from '../roster'
import type { RosterEntry } from '../types'
import type { CharacterKind } from './character-parts'

interface CyberpunkCharacter extends RosterEntry {
  kind: CharacterKind
  provider: ProviderId
  isSquad: boolean
}

export const CYBERPUNK_CAST: readonly CyberpunkCharacter[] = [
  {
    id: 'aegis',
    name: 'Aegis',
    role: 'Civic samurai with plated shoulders and a sheathed blade.',
    kind: 'samurai',
    provider: 'claude',
    isSquad: false
  },
  {
    id: 'bastion',
    name: 'Bastion',
    role: 'Broad armored guard with reinforced knees.',
    kind: 'guard',
    provider: 'claude',
    isSquad: false
  },
  {
    id: 'patch',
    name: 'Patch',
    role: 'Field medic with a pale supply pack.',
    kind: 'medic',
    provider: 'claude',
    isSquad: false
  },
  {
    id: 'resident',
    name: 'Resident',
    role: 'Civic assistant in a fitted jacket.',
    kind: 'human',
    provider: 'claude',
    isSquad: true
  },
  {
    id: 'socket',
    name: 'Socket',
    role: 'Workshop technician with goggles and a wrist instrument.',
    kind: 'technician',
    provider: 'codex',
    isSquad: false
  },
  {
    id: 'torque',
    name: 'Torque',
    role: 'Mechanic with a tool belt and hand wrench.',
    kind: 'mechanic',
    provider: 'codex',
    isSquad: false
  },
  {
    id: 'parcel',
    name: 'Parcel',
    role: 'Courier with a delivery backpack and peaked cap.',
    kind: 'courier',
    provider: 'codex',
    isSquad: true
  },
  {
    id: 'beacon',
    name: 'Beacon',
    role: 'Scout robot with optical sensors and an antenna.',
    kind: 'scoutrobo',
    provider: 'opencode',
    isSquad: false
  },
  {
    id: 'cipher',
    name: 'Cipher',
    role: 'Signal analyst with a long jacket and ear receiver.',
    kind: 'analyst',
    provider: 'opencode',
    isSquad: false
  },
  {
    id: 'vector',
    name: 'Vector',
    role: 'Transit pilot with a headset and harness.',
    kind: 'pilot',
    provider: 'opencode',
    isSquad: true
  }
]

export const cyberpunkRoster = makeRoster('cyberpunk-city', CYBERPUNK_CAST, (character) => ({
  provider: character.provider,
  isSquad: character.isSquad
}))
