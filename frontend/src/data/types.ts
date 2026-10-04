/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

// ── 变电站归属与权限（台账归属、移交、交接班、退役办结）──────────────────

export type PowerStation = {
  id: string
  name: string
}

export type Operator = {
  id: string
  name: string
  stationId: string
  stationName: string
}

export type SubstationRow = EntryRow & {
  站名: string
  电压等级: string
  所属供电所: string
  接线方式: string
}

// 台账流水：改动申请、归属移交、退役申请与办结、交接班、越权留痕都落这一条账。
export type LedgerType = 'field-change' | 'transfer' | 'retirement' | 'handover' | 'action' | 'note'

export type LedgerStatus = '办理中' | '已办结' | '已退回'

export type SubstationLedgerEntry = {
  id: number
  stationId: number
  stationName: string
  type: LedgerType
  status: LedgerStatus | '—'
  changes: Record<string, { from: string; to: string }>
  reason: string
  note: string
  // 原经办人：申请由谁发起，交接班也不覆盖这一栏。
  createdBy: string
  createdByName: string
  createdAt: string
  // 当前经办人：交接班后改成接班人；办结/退回时记录实际处理人。
  handlerId: string
  handlerName: string
  handledBy: string
  handledByName: string
  handledAt: string
  rejectReason: string
}

export type SubstationView = {
  row: SubstationRow
  ownerStationName: string
  ownerConflict: boolean
  activeChange?: SubstationLedgerEntry
  activeRetirement?: SubstationLedgerEntry
  latestTransfer?: SubstationLedgerEntry
}

export type SubstationPerms = {
  canManage: boolean
  retired: boolean
  editBlockedReason: string
  actionBlockedReason: string
}
