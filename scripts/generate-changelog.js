#!/usr/bin/env node

/**
 * Generate changelog from conventional commits since the last version tag.
 *
 * Usage:
 *   node scripts/generate-changelog.js          # outputs to stdout
 *   node scripts/generate-changelog.js --write   # also writes to CHANGELOG.md
 *
 * Reads commits between the previous version tag and HEAD, groups them by type
 * (feat, fix, refactor, etc.), and produces a Markdown changelog section.
 *
 * The output is also stored in package.json `changelog` field so electron-builder
 * can inject it into the GitHub Release body via the `releaseNotes` option.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const currentVersion = pkg.version

// Find the two most recent version tags to get the commit range
function getLastTwoTags() {
  try {
    const tags = execFileSync('git', ['tag', '--sort=-v:refname', '--list', 'v*'], {
      cwd: ROOT,
      encoding: 'utf-8'
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    // Also check tags without 'v' prefix (e.g. "1.2.5")
    const numericTags = execFileSync('git', ['tag', '--sort=-v:refname'], {
      cwd: ROOT,
      encoding: 'utf-8'
    })
      .trim()
      .split('\n')
      .filter((t) => /^\d+\.\d+\.\d+$/.test(t) || /^v\d+\.\d+\.\d+$/.test(t))

    const allTags = [...new Set([...tags, ...numericTags])].sort((a, b) => {
      const va = a.replace(/^v/, '').split('.').map(Number)
      const vb = b.replace(/^v/, '').split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        if ((vb[i] || 0) !== (va[i] || 0)) return (vb[i] || 0) - (va[i] || 0)
      }
      return 0
    })

    return { current: allTags[0] || null, previous: allTags[1] || null }
  } catch {
    return { current: null, previous: null }
  }
}

function getCommits(since) {
  const args = ['log', '--pretty=format:%H|%s', '--no-merges']
  if (since) {
    args.push(`${since}..HEAD`)
  }
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split('|')
        return { hash: hash.slice(0, 7), message: rest.join('|') }
      })
  } catch {
    return []
  }
}

function categorize(commits) {
  const categories = {
    features: { label: 'Features', emoji: '🚀', items: [] },
    fixes: { label: 'Bug Fixes', emoji: '🐛', items: [] },
    perf: { label: 'Performance', emoji: '⚡', items: [] },
    refactor: { label: 'Refactoring', emoji: '♻️', items: [] },
    docs: { label: 'Documentation', emoji: '📝', items: [] },
    test: { label: 'Tests', emoji: '✅', items: [] },
    chore: { label: 'Chores', emoji: '🔧', items: [] },
    other: { label: 'Other Changes', emoji: '📦', items: [] }
  }

  for (const commit of commits) {
    const msg = commit.message

    // Skip version-bump commits (e.g. "1.2.5")
    if (/^\d+\.\d+\.\d+$/.test(msg)) continue

    // Parse conventional commit: "type(scope): description" or "type: description"
    const match = msg.match(/^(\w+)(?:\(([^)]*)\))?:\s*(.+)$/)
    if (match) {
      const [, type, scope, description] = match
      const desc = scope ? `**${scope}**: ${description}` : description

      switch (type) {
        case 'feat':
          categories.features.items.push({ desc, hash: commit.hash })
          break
        case 'fix':
          categories.fixes.items.push({ desc, hash: commit.hash })
          break
        case 'perf':
          categories.perf.items.push({ desc, hash: commit.hash })
          break
        case 'refactor':
          categories.refactor.items.push({ desc, hash: commit.hash })
          break
        case 'docs':
          categories.docs.items.push({ desc, hash: commit.hash })
          break
        case 'test':
          categories.test.items.push({ desc, hash: commit.hash })
          break
        case 'chore':
        case 'build':
        case 'ci':
          categories.chore.items.push({ desc, hash: commit.hash })
          break
        default:
          categories.other.items.push({ desc: msg, hash: commit.hash })
      }
    } else {
      categories.other.items.push({ desc: msg, hash: commit.hash })
    }
  }

  return categories
}

function formatMarkdown(version, categories, previousTag) {
  const date = new Date().toISOString().split('T')[0]
  const lines = [`## v${version} (${date})`, '']

  const order = ['features', 'fixes', 'perf', 'refactor', 'docs', 'test', 'chore', 'other']

  for (const key of order) {
    const cat = categories[key]
    if (cat.items.length === 0) continue

    lines.push(`### ${cat.emoji} ${cat.label}`, '')
    for (const item of cat.items) {
      lines.push(`- ${item.desc} (\`${item.hash}\`)`)
    }
    lines.push('')
  }

  // Add compare link if we have a previous tag
  if (previousTag) {
    lines.push(
      `**Full Changelog**: [\`${previousTag}...v${version}\`](https://github.com/theangeloumali/ClaudeWatch/compare/${previousTag}...v${version})`
    )
    lines.push('')
  }

  return lines.join('\n')
}

// Also produce a plain-text version for electron-updater release notes
function formatPlainText(version, categories) {
  const lines = [`ClaudeWatch v${version}`, '']

  const order = ['features', 'fixes', 'perf', 'refactor']
  for (const key of order) {
    const cat = categories[key]
    if (cat.items.length === 0) continue
    lines.push(`${cat.emoji} ${cat.label}:`)
    for (const item of cat.items) {
      lines.push(`  • ${item.desc}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

// Main
const tags = getLastTwoTags()
const commits = getCommits(tags.current)
const categories = categorize(commits)

const hasContent = Object.values(categories).some((c) => c.items.length > 0)
if (!hasContent) {
  console.log(`No conventional commits found since ${tags.current || 'beginning'}`)
  process.exit(0)
}

const markdown = formatMarkdown(currentVersion, categories, tags.current)
const plainText = formatPlainText(currentVersion, categories)

// Output to stdout
console.log(markdown)

// Write release-notes.md for electron-builder
const releaseNotesPath = path.join(ROOT, 'release-notes.md')
fs.writeFileSync(releaseNotesPath, plainText, 'utf-8')
console.log(`\n  → Wrote ${releaseNotesPath}`)

// Optionally prepend to CHANGELOG.md
if (process.argv.includes('--write')) {
  const changelogPath = path.join(ROOT, 'CHANGELOG.md')
  let existing = ''
  try {
    existing = fs.readFileSync(changelogPath, 'utf-8')
  } catch {
    existing = '# Changelog\n\n'
  }

  // Insert after the "# Changelog" header
  const headerEnd = existing.indexOf('\n\n')
  if (headerEnd !== -1) {
    const updated =
      existing.slice(0, headerEnd + 2) + markdown + '\n' + existing.slice(headerEnd + 2)
    fs.writeFileSync(changelogPath, updated, 'utf-8')
  } else {
    fs.writeFileSync(changelogPath, `# Changelog\n\n${markdown}\n${existing}`, 'utf-8')
  }
  console.log(`  → Updated ${changelogPath}`)
}
