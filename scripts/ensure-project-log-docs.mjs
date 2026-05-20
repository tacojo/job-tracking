#!/usr/bin/env node
/**
 * Create docs/tickets.json, adrs.json, activity-log.json from *.sample.json
 * when missing (never overwrites existing files).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findDocsDir() {
  const candidates = [
    path.resolve(__dirname, '../docs'),
    path.resolve(process.cwd(), '../docs'),
    path.resolve(process.cwd(), 'docs'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'tickets.sample.json'))) return dir
  }
  throw new Error(
    'Could not find docs/ with tickets.sample.json (run from repo root or frontend/)'
  )
}

const docsDir = findDocsDir()
const names = ['tickets', 'adrs', 'activity-log']

for (const name of names) {
  const target = path.join(docsDir, `${name}.json`)
  const sample = path.join(docsDir, `${name}.sample.json`)
  if (fs.existsSync(target)) continue
  if (!fs.existsSync(sample)) {
    console.warn(`[project-log] Skip ${name}.json: missing ${name}.sample.json`)
    continue
  }
  fs.copyFileSync(sample, target)
  console.log(`[project-log] Created ${target} from ${name}.sample.json`)
}
