import type { LedgerRecord } from './types'

// 变电站名册的变更与移交记录单独存一份：按站编号归档，刷新、关掉再打开都还在。
const STORAGE_KEY = 'substation-protection:substation-ledger'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, LedgerRecord[]> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    return JSON.parse(raw) as Record<string, LedgerRecord[]>
  } catch {
    return {}
  }
}

let cache: Record<string, LedgerRecord[]> | null = null

function allRecords(): Record<string, LedgerRecord[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allRecords()))
  }
}

export function ledgerRecords(substationId: number): LedgerRecord[] {
  return clone(allRecords()[String(substationId)] ?? [])
}

export function appendLedgerRecord(substationId: number, record: LedgerRecord): void {
  const key = String(substationId)
  const next = { ...allRecords() }
  next[key] = [...(next[key] ?? []), record]
  cache = next
  persist()
}

export function ledgerStorageKey(): string {
  return STORAGE_KEY
}
