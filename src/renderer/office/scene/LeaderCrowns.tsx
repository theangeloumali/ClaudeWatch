import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { AgentView, SessionRef } from '../../../shared/office/types'
import { officePoses } from '../../office-live/pose-store'
import { buildingPlaces } from '../logic/building-place'
import { cityClock } from '../logic/city-clock'
import { buildingIdOf } from '../logic/city-signals'
import { citySignalStore } from '../logic/city-signal-store'
import type { ThemePalette } from '../themes/types'
import { createLeaderCrownsLayer } from './leader-crowns-layer'

// Gold crowns over the day's top three spenders: one instanced draw outside every batch.
export function LeaderCrowns({
  agents,
  sessions,
  palette
}: {
  agents: readonly AgentView[]
  sessions: readonly SessionRef[]
  palette: ThemePalette
}) {
  const layer = useMemo(() => createLeaderCrownsLayer(palette), [palette])
  useEffect(() => () => layer.dispose(), [layer])
  const byKey = useMemo(() => new Map(agents.map((agent) => [agent.agentKey, agent])), [agents])
  const buildings = useMemo(
    () =>
      new Map(
        sessions.map((session) => [
          session.key,
          buildingIdOf(session.companyKey, session.projectKey)
        ])
      ),
    [sessions]
  )
  useFrame(({ camera }) =>
    layer.update({
      crowned: citySignalStore.current().leaders.crowned,
      agents: byKey,
      buildingOf: (agentKey) => buildings.get(agentKey) ?? null,
      places: buildingPlaces,
      poses: officePoses,
      camera,
      nowMs: cityClock.now(),
      isPinned: cityClock.isPinned()
    })
  )
  return <primitive object={layer.group} />
}
