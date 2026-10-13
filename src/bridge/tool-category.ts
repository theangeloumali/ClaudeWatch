import type { AgentActivity, ToolCategory } from '../shared/office/types'

const categories: Record<string, ToolCategory> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Edit: 'edit',
  Write: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Bash: 'run',
  BashOutput: 'run',
  KillShell: 'run',
  WebSearch: 'web',
  WebFetch: 'web',
  Task: 'agent',
  Agent: 'agent',
  // OpenCode names its tools in lower case.
  read: 'read',
  grep: 'read',
  glob: 'read',
  list: 'read',
  lsp: 'read',
  edit: 'edit',
  write: 'edit',
  multiedit: 'edit',
  patch: 'edit',
  apply_patch: 'edit',
  bash: 'run',
  shell: 'run',
  exec: 'run',
  exec_command: 'run',
  web_search: 'web',
  webfetch: 'web',
  websearch: 'web',
  codesearch: 'web',
  task: 'agent',
  subagent: 'agent'
}
export function toolCategory(name: string): ToolCategory {
  return Object.hasOwn(categories, name) ? categories[name] : 'other'
}
export function toolActivity(category: ToolCategory): AgentActivity {
  const activities: Record<ToolCategory, AgentActivity> = {
    read: 'reading',
    edit: 'editing',
    run: 'running',
    web: 'searching',
    agent: 'delegating',
    other: 'running'
  }
  return activities[category]
}
