import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'substation-protection:entries'
const VERSION_KEY = 'substation-protection:version'
// 台账归属收权改造后，变电站种子换成真实供电所口径；老版本本地数据整体回种一次，
// 只影响这一份演示库，不碰浏览器里的其他数据。
const DATA_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const version = window.localStorage.getItem(VERSION_KEY)
  if (version !== String(DATA_VERSION)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    window.localStorage.setItem(VERSION_KEY, String(DATA_VERSION))
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 结构化集合：归属台账等带嵌套字段的数据单独存一个 localStorage 键，
// 与扁平台账互不影响；键名仍沿用 substation-protection: 前缀。
const COLLECTION_PREFIX = 'substation-protection:'

export function loadCollection<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(fallback)
  }
  const raw = window.localStorage.getItem(COLLECTION_PREFIX + key)
  if (!raw) {
    window.localStorage.setItem(COLLECTION_PREFIX + key, JSON.stringify(fallback))
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(COLLECTION_PREFIX + key, JSON.stringify(fallback))
    return clone(fallback)
  }
}

export function saveCollection<T>(key: string, value: T): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(COLLECTION_PREFIX + key, JSON.stringify(value))
  }
}

export function resetCollection<T>(key: string, fallback: T): T {
  saveCollection(key, fallback)
  return clone(fallback)
}

export function nextCollectionId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
}

export function nextRowId(rows: EntryRow[]): number {
  return nextCollectionId(rows)
}
