import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Color, type Group, type Object3D } from 'three'
import { citySignalStore, type CitySignalStore } from '../logic/city-signal-store'
import { companyHues, useCompanyLens } from '../logic/company-lens'
import type { FloorGeometry, ZoneGeometry } from '../scene-model'
import type { ThemePalette } from '../themes/types'
import { buildingGroupName, buildingKeyOf } from './all-floor-model'
import { batchesOf, retintBatches, type MeshBatch } from './mesh-batches'

// How far an office's own colours move toward its company's hue; its shading still reads.
export const LENS_MIX = 0.7

// PhysicalBuildingShell names each office's group after its building.
const OFFICE_GROUP = buildingGroupName('')

export const buildingIdOfGroup = (name: string | undefined): string | null =>
  name?.startsWith(OFFICE_GROUP) ? name.slice(OFFICE_GROUP.length) : null

function companiesIn(zones: readonly ZoneGeometry[], into: Set<string>): Set<string> {
  for (const zone of zones) {
    if (zone.companyKey) into.add(zone.companyKey)
    companiesIn(zone.children, into)
  }
  return into
}

// Each office's company. A shared headquarters holds several, so it keeps its own colours.
export function buildingCompanies(floors: readonly FloorGeometry[]): ReadonlyMap<string, string> {
  const held = new Map<string, Set<string>>()
  for (const floor of floors) {
    const id = buildingKeyOf(floor)
    held.set(id, companiesIn(floor.zones, held.get(id) ?? new Set()))
  }
  const companies = new Map<string, string>()
  for (const [id, keys] of held) if (keys.size === 1) companies.set(id, [...keys][0])
  return companies
}

function companyOf(part: Object3D, buildings: ReadonlyMap<string, string>): string | null {
  for (let node: Object3D | null = part; node; node = node.parent) {
    const id = buildingIdOfGroup(node.name)
    if (id !== null) return buildings.get(id) ?? null
  }
  return null
}

interface LensFrame {
  batches: readonly MeshBatch[]
  buildings: ReadonlyMap<string, string>
  isOn: boolean
  palette: ThemePalette
  signals: CitySignalStore
}

interface Hues {
  isOn: boolean
  palette: ThemePalette
  version: number
  byCompany: ReadonlyMap<string, Color> | null
  print: string
}

interface LensDriver {
  // True when it wrote colours: once per toggle, company change or rebuilt batch.
  sync(frame: LensFrame): boolean
}

export function createLensDriver(): LensDriver {
  let hues: Hues | null = null
  let shown: Pick<LensFrame, 'batches' | 'buildings'> & { print: string } = {
    batches: [],
    buildings: new Map(),
    print: ''
  }
  const mixed = new Color()
  // The hues follow only the set of companies, never a token tick.
  const huesFor = ({ isOn, palette, signals }: LensFrame): Hues => {
    const version = signals.sceneVersion()
    if (hues?.isOn === isOn && hues.palette === palette && hues.version === version) return hues
    const picked = isOn ? companyHues(signals.current().companies.keys(), palette) : null
    const byCompany = picked && new Map([...picked].map(([key, hex]) => [key, new Color(hex)]))
    hues = { isOn, palette, version, byCompany, print: picked ? JSON.stringify([...picked]) : '' }
    return hues
  }
  return {
    sync(frame) {
      const { byCompany, print } = huesFor(frame)
      const isRebuilt = shown.batches !== frame.batches
      if (!isRebuilt && shown.buildings === frame.buildings && shown.print === print) return false
      shown = { batches: frame.batches, buildings: frame.buildings, print }
      // A rebuilt batch draws its own colours: with the lens off there is nothing to undo.
      if (isRebuilt && !byCompany) return false
      // Every instance of a part shares its office, so each part is looked up once a pass.
      const companies = new Map<Object3D, string | null>()
      const companyOfPart = (part: Object3D): string | null => {
        let company = companies.get(part)
        if (company === undefined) {
          company = companyOf(part, frame.buildings)
          companies.set(part, company)
        }
        return company
      }
      retintBatches(frame.batches, (part, own) => {
        const company = byCompany && companyOfPart(part)
        const hue = company ? byCompany.get(company) : undefined
        return hue ? mixed.copy(own).lerp(hue, LENS_MIX) : null
      })
      return true
    }
  }
}

interface CompanyLensProps {
  floors: readonly FloorGeometry[]
  palette: ThemePalette
}

// Mounted inside the offices' BatchedScene: it re-tints that scene's batches and adds no draw.
export function CompanyLens({ floors, palette }: CompanyLensProps) {
  const isOn = useCompanyLens()
  const anchor = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const [driver] = useState(createLensDriver)
  const buildings = useMemo(() => buildingCompanies(floors), [floors])
  // The demand loop draws nothing by itself: a toggle asks for the frame that shows it.
  useEffect(() => invalidate(), [invalidate, isOn])
  useFrame(() => {
    const root = anchor.current?.parent
    if (root)
      driver.sync({ batches: batchesOf(root), buildings, isOn, palette, signals: citySignalStore })
  })
  return <group ref={anchor} />
}
