import { join } from 'node:path'
import type { AgentActivity, CurrentTool, SubagentRef } from '../shared/office/types'
import { type BridgeIo, isLabel, isMissing, jsonObject } from './io'
import { isStillWorking, OPEN_TOOL_HOLD_MS, quietFor, SUBAGENT_FRESH_MS } from './liveness'
import { toolActivity } from './tool-category'
import { claudeModel, readTranscript, rememberedAgentType } from './transcript-tail'

export interface AgentFile {
  id: string
  path: string
  size: number
  mtimeMs: number
}

// subagents/agent-<id>.jsonl, and subagents/workflows/<wf>/agent-<id>.jsonl for workflow agents.
const AGENT_TRANSCRIPT = /^agent-([\w-]+)\.jsonl$/
const MAX_FOLDER_DEPTH = 3

export async function listAgentFiles(transcript: string, io: BridgeIo): Promise<AgentFile[]> {
  const found: AgentFile[] = []
  async function walk(directory: string, depth: number): Promise<void> {
    let names: string[]
    try {
      names = await io.list(directory)
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
    for (const name of names) {
      const id = AGENT_TRANSCRIPT.exec(name)?.[1]
      // Meta files, journals and skill markers are never opened or descended into.
      if (!id && (/\.jsonl?$/.test(name) || depth >= MAX_FOLDER_DEPTH)) continue
      const path = join(directory, name)
      try {
        const info = await io.stat(path)
        if (id && !info.directory) found.push({ id, path, size: info.size, mtimeMs: info.mtimeMs })
        else if (!id && info.directory) await walk(path, depth + 1)
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    }
  }
  await walk(join(transcript.slice(0, -6), 'subagents'), 1)
  return found.sort((a, b) => a.id.localeCompare(b.id))
}

// The tool still open at the end of an agent's record, if any, and the model it last ran on.
async function openState(
  file: AgentFile,
  io: BridgeIo
): Promise<{ tool: CurrentTool | null; model?: string }> {
  try {
    const { tool, model } = await readTranscript(file.path, io, file)
    return { tool, ...(model && { model }) }
  } catch (error) {
    if (isMissing(error)) return { tool: null }
    throw error
  }
}

async function agentTypeOf(file: AgentFile, io: BridgeIo): Promise<string | null> {
  return rememberedAgentType(file.path, io, async () => {
    const meta = jsonObject(await io.readText(file.path.replace(/\.jsonl$/, '.meta.json')))
    return isLabel(meta?.agentType) ? meta.agentType : null
  })
}

export async function liveSubagents(
  files: AgentFile[],
  io: BridgeIo,
  now: number
): Promise<SubagentRef[]> {
  const agents: SubagentRef[] = []
  for (const file of files) {
    const quietMs = quietFor(now, file.mtimeMs)
    if (quietMs === null || quietMs >= OPEN_TOOL_HOLD_MS) continue
    try {
      const { tool, model } = await openState(file, io)
      if (!isStillWorking(quietMs, SUBAGENT_FRESH_MS, tool !== null)) continue
      const type = await agentTypeOf(file, io)
      const activity: AgentActivity = tool ? toolActivity(tool.category) : 'thinking'
      if (type) {
        agents.push({
          id: file.id,
          type,
          activity,
          ...(model && { selectedModel: claudeModel(model) })
        })
      }
    } catch (error) {
      if (!isMissing(error)) throw error
    }
  }
  return agents
}
