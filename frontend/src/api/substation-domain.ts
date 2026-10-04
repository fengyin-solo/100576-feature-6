import {
  listRows,
  loadCollection,
  nextCollectionId,
  nextRowId,
  resetCollection,
  resetRows,
  saveCollection,
  saveRows,
} from '@/data/local-store'
import { operatorById, POWER_STATIONS, stationOperators } from '@/data/org'
import { SEED_SUBSTATION_LEDGER } from '@/data/substation-seed'
import type {
  ActionResult,
  EntryRow,
  Operator,
  SubstationLedgerEntry,
  SubstationPerms,
  SubstationRow,
  SubstationView,
} from '@/data/types'

// 变电站归属台账（结构化流水）在 localStorage 里的键。
const LEDGER_KEY = 'substation-ledger'

// 只有归属所的值班人能动这三栏；其余字段不在本次收权范围。
export const RESTRICTED_FIELDS = ['站名', '电压等级', '接线方式'] as const

export const VOLTAGE_LEVELS = ['35kV', '110kV', '220kV']
export const WIRING_MODES = [
  '线路变压器组接线',
  '单母线接线',
  '单母线分段接线',
  '双母线接线',
  '内桥接线',
]

const SUBSTATION_KEY = 'substation'
const WORKPERMIT_KEY = 'workpermit'
const RETIRED_STATUS = '已退役'

function nowText(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── 台账流水 ──────────────────────────────────────────────────────────────

export function substationLedger(): SubstationLedgerEntry[] {
  return loadCollection<SubstationLedgerEntry[]>(LEDGER_KEY, SEED_SUBSTATION_LEDGER)
}

function saveLedger(entries: SubstationLedgerEntry[]): void {
  saveCollection(LEDGER_KEY, entries)
}

function appendLedger(entry: Omit<SubstationLedgerEntry, 'id'>): SubstationLedgerEntry[] {
  const entries = substationLedger()
  const saved: SubstationLedgerEntry = { ...entry, id: nextCollectionId(entries) }
  entries.push(saved)
  saveLedger(entries)
  return entries
}

// ── 归属口径：以最近一次已办结移交记录为准 ───────────────────────────────

function transferEntries(entries: SubstationLedgerEntry[]): SubstationLedgerEntry[] {
  return entries
    .filter((entry) => entry.type === 'transfer' && entry.status === '已办结')
    .sort((a, b) => (a.handledAt < b.handledAt ? 1 : a.handledAt > b.handledAt ? -1 : 0))
}

export function latestTransfer(stationId: number): SubstationLedgerEntry | undefined {
  return transferEntries(substationLedger()).find((entry) => entry.stationId === stationId)
}

// 归属所名称：先查移交记录，没有移交记录时沿用台账里「所属供电所」的既有口径。
export function ownerStationName(row: EntryRow): string {
  const transfer = latestTransfer(Number(row.id))
  return transfer ? transfer.changes['所属供电所']?.to ?? String(row['所属供电所'])
                    : String(row['所属供电所'])
}

function stationRows(): SubstationRow[] {
  return listRows(SUBSTATION_KEY) as SubstationRow[]
}

function findStation(stationId: number): SubstationRow | undefined {
  return stationRows().find((row) => Number(row.id) === stationId)
}

function saveStations(rows: SubstationRow[]): void {
  saveRows(SUBSTATION_KEY, rows)
}

function activeEntry(
  stationId: number,
  type: SubstationLedgerEntry['type'],
): SubstationLedgerEntry | undefined {
  return substationLedger().find(
    (entry) => entry.stationId === stationId && entry.type === type && entry.status === '办理中',
  )
}

// ── 视图口径：列表页与详情抽屉都只能用这一份，站名、归属永远一致 ────────

export function stationView(row: SubstationRow): SubstationView {
  const id = Number(row.id)
  const owner = ownerStationName(row)
  return {
    row,
    ownerStationName: owner,
    ownerConflict: owner !== String(row['所属供电所']),
    activeChange: activeEntry(id, 'field-change'),
    activeRetirement: activeEntry(id, 'retirement'),
    latestTransfer: latestTransfer(id),
  }
}

export function listStationViews(): SubstationView[] {
  return stationRows().map(stationView)
}

export function stationViewById(stationId: number): SubstationView | undefined {
  const row = findStation(stationId)
  return row ? stationView(row) : undefined
}

export function stationTimeline(stationId: number): SubstationLedgerEntry[] {
  return substationLedger()
    .filter((entry) => entry.stationId === stationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

// ── 权限判定：退役只读；非归属所只能查看 ────────────────────────────────

function denied(view: SubstationView, operator: Operator, action: string, reason: string): ActionResult {
  appendLedger({
    stationId: Number(view.row.id),
    stationName: String(view.row.站名),
    type: 'note',
    status: '已退回',
    changes: {},
    reason: `越权${action}被退回`,
    note: reason,
    createdBy: operator.id,
    createdByName: operator.name,
    createdAt: nowText(),
    handlerId: operator.id,
    handlerName: operator.name,
    handledBy: operator.id,
    handledByName: operator.name,
    handledAt: nowText(),
    rejectReason: reason,
  })
  return { ok: false, message: reason }
}

export function stationPerms(view: SubstationView, operator: Operator): SubstationPerms {
  const retired = String(view.row.status) === RETIRED_STATUS
  const canManage = operator.stationName === view.ownerStationName
  return {
    canManage: canManage && !retired,
    retired,
    editBlockedReason: retired
      ? '该站已办结退役，整条台账已锁为只读，不能再改动'
      : canManage
        ? ''
        : `越权退回：${String(view.row.站名)}归${view.ownerStationName}管辖，${operator.stationName}的值班人只能查看，不能改动`,
    actionBlockedReason: retired
      ? '该站已办结退役，整条台账已锁为只读，不能再执行流转动作'
      : canManage
        ? ''
        : `越权退回：${String(view.row.站名)}归${view.ownerStationName}管辖，流转动作仅该所值班人可办理`,
  }
}

// ── 站名、电压等级、接线方式的收权改动 ──────────────────────────────────

export function submitFieldChange(
  stationId: number,
  operator: Operator,
  patch: Record<string, string>,
  reason: string,
): ActionResult {
  const view = stationViewById(stationId)
  if (!view) {
    return { ok: false, message: `没有找到编号为 ${stationId} 的变电站` }
  }
  const perms = stationPerms(view, operator)
  if (!perms.canManage) {
    return denied(view, operator, '改动', perms.editBlockedReason)
  }
  const keys = Object.keys(patch).filter((key) =>
    (RESTRICTED_FIELDS as readonly string[]).includes(key),
  )
  const changes: SubstationLedgerEntry['changes'] = {}
  for (const key of keys) {
    const next = String(patch[key] ?? '').trim()
    const from = String(view.row[key] ?? '')
    if (!next) {
      return { ok: false, message: `「${key}」不能为空，改动已退回` }
    }
    if (next !== from) {
      changes[key] = { from, to: next }
    }
  }
  if (Object.keys(changes).length === 0) {
    return { ok: false, message: '填写的内容与现状一致，没有需要提交的改动' }
  }
  if (view.activeChange) {
    return {
      ok: false,
      message: '该站已有一条办理中的改动，请先办结或退回，不能重复提交',
    }
  }
  if (!reason.trim()) {
    return { ok: false, message: '改动必须写明理由，否则不予受理' }
  }
  appendLedger({
    stationId,
    stationName: String(view.row.站名),
    type: 'field-change',
    status: '办理中',
    changes,
    reason: reason.trim(),
    note: '',
    createdBy: operator.id,
    createdByName: operator.name,
    createdAt: nowText(),
    handlerId: operator.id,
    handlerName: operator.name,
    handledBy: '',
    handledByName: '',
    handledAt: '',
    rejectReason: '',
  })
  return { ok: true, message: `改动申请已提交，经办人：${operator.name}；办结后生效` }
}

export function completeFieldChange(ledgerId: number, operator: Operator): ActionResult {
  const entries = substationLedger()
  const entry = entries.find((item) => item.id === ledgerId && item.type === 'field-change')
  if (!entry) {
    return { ok: false, message: '没有找到这条改动记录' }
  }
  if (entry.status !== '办理中') {
    return { ok: false, message: `改动已${entry.status}，不能重复办结` }
  }
  const view = stationViewById(entry.stationId)
  if (!view) {
    return { ok: false, message: '改动对应的变电站已不存在' }
  }
  if (operator.stationName !== view.ownerStationName) {
    return denied(view, operator, '办结改动',
      `越权退回：${view.row.站名}归${view.ownerStationName}管辖，${operator.stationName}的值班人不能办结该所的改动`)
  }
  const rows = stationRows()
  const index = rows.findIndex((row) => Number(row.id) === entry.stationId)
  if (index < 0) {
    return { ok: false, message: '改动对应的变电站已不存在' }
  }
  for (const [key, change] of Object.entries(entry.changes)) {
    rows[index][key] = change.to
  }
  saveStations(rows)
  entry.status = '已办结'
  entry.handledBy = operator.id
  entry.handledByName = operator.name
  entry.handledAt = nowText()
  entry.note = '改动已写入台账'
  saveLedger(entries)
  return { ok: true, message: `改动已办结并写入台账，经办人 ${entry.handlerName}，原经办人 ${entry.createdByName}` }
}

export function rejectFieldChange(ledgerId: number, operator: Operator, rejectReason: string): ActionResult {
  const entries = substationLedger()
  const entry = entries.find((item) => item.id === ledgerId && item.type === 'field-change')
  if (!entry) {
    return { ok: false, message: '没有找到这条改动记录' }
  }
  if (entry.status !== '办理中') {
    return { ok: false, message: `改动已${entry.status}，不能重复处理` }
  }
  const view = stationViewById(entry.stationId)
  if (!view) {
    return { ok: false, message: '改动对应的变电站已不存在' }
  }
  if (operator.stationName !== view.ownerStationName) {
    return denied(view, operator, '退回改动',
      `越权退回：${view.row.站名}归${view.ownerStationName}管辖，${operator.stationName}的值班人不能处理该所的改动`)
  }
  if (!rejectReason.trim()) {
    return { ok: false, message: '退回必须写明理由' }
  }
  entry.status = '已退回'
  entry.handledBy = operator.id
  entry.handledByName = operator.name
  entry.handledAt = nowText()
  entry.rejectReason = rejectReason.trim()
  entry.note = '改动未写入台账'
  saveLedger(entries)
  return { ok: true, message: `改动已退回：${rejectReason.trim()}（原经办人 ${entry.createdByName}）` }
}

// ── 归属移交：提交即生效，后续归属一律以最近一次移交记录为准 ────────────

export function transferStation(
  stationId: number,
  operator: Operator,
  targetStationName: string,
  reason: string,
): ActionResult {
  const view = stationViewById(stationId)
  if (!view) {
    return { ok: false, message: `没有找到编号为 ${stationId} 的变电站` }
  }
  if (view.ownerStationName === RETIRED_STATUS || String(view.row.status) === RETIRED_STATUS) {
    return { ok: false, message: '该站已办结退役，台账已锁定，不能再移交归属' }
  }
  if (operator.stationName !== view.ownerStationName) {
    return denied(view, operator, '移交归属',
      `越权退回：${view.row.站名}归${view.ownerStationName}管辖，${operator.stationName}的值班人不能把它移交出去`)
  }
  if (!POWER_STATIONS.some((item) => item.name === targetStationName)) {
    return { ok: false, message: '接收供电所不在既有供电所名册里，移交已退回' }
  }
  if (targetStationName === view.ownerStationName) {
    return { ok: false, message: `${view.row.站名}本就归属${targetStationName}，无需移交` }
  }
  if (!reason.trim()) {
    return { ok: false, message: '移交必须写明理由，否则不予受理' }
  }
  // 在办事项跟着归属走：原经办人留在 createdBy，经办人改成接收所当前提交人之外的
  // 默认值班人；实际由谁办结，handledBy 里再记。
  const receiver = stationOperators(
    POWER_STATIONS.find((item) => item.name === targetStationName)!.id,
  )[0]
  const entries = substationLedger()
  for (const item of entries) {
    if (
      item.stationId === stationId &&
      item.status === '办理中' &&
      (item.type === 'field-change' || item.type === 'retirement')
    ) {
      item.handlerId = receiver.id
      item.handlerName = receiver.name
      item.note = `${item.note ? item.note + '；' : ''}归属移交，在办事项转${targetStationName}继续办理，原经办人 ${item.createdByName} 留在历史里`
    }
  }
  entries.push({
    id: nextCollectionId(entries),
    stationId,
    stationName: String(view.row.站名),
    type: 'transfer',
    status: '已办结',
    changes: { 所属供电所: { from: view.ownerStationName, to: targetStationName } },
    reason: reason.trim(),
    note: '移交即时生效，归属以本条记录为准',
    createdBy: operator.id,
    createdByName: operator.name,
    createdAt: nowText(),
    handlerId: operator.id,
    handlerName: operator.name,
    handledBy: operator.id,
    handledByName: operator.name,
    handledAt: nowText(),
    rejectReason: '',
  })
  saveLedger(entries)
  return { ok: true, message: `${view.row.站名}已移交${targetStationName}，后续改动只有${targetStationName}值班人能办理` }
}

// ── 退役：归属所提交（同一座站重复提交只落一条），办结后整条只读 ────────

export function submitRetirement(stationId: number, operator: Operator, reason: string): ActionResult {
  const view = stationViewById(stationId)
  if (!view) {
    return { ok: false, message: `没有找到编号为 ${stationId} 的变电站` }
  }
  const perms = stationPerms(view, operator)
  if (!perms.canManage) {
    return denied(view, operator, '办理退役', perms.actionBlockedReason)
  }
  if (view.activeRetirement) {
    return {
      ok: false,
      message: '该站已有一条办理中的退役申请，重复提交不再落新记录',
    }
  }
  if (!reason.trim()) {
    return { ok: false, message: '退役必须写明理由，否则不予受理' }
  }
  appendLedger({
    stationId,
    stationName: String(view.row.站名),
    type: 'retirement',
    status: '办理中',
    changes: { 站点状态: { from: String(view.row.status), to: RETIRED_STATUS } },
    reason: reason.trim(),
    note: '',
    createdBy: operator.id,
    createdByName: operator.name,
    createdAt: nowText(),
    handlerId: operator.id,
    handlerName: operator.name,
    handledBy: '',
    handledByName: '',
    handledAt: '',
    rejectReason: '',
  })
  return { ok: true, message: `退役申请已提交（经办人：${operator.name}），办结后该站整条锁为只读` }
}

function existingRetirementPermit(stationName: string, rows: EntryRow[]): EntryRow | undefined {
  // 同一座站重复办结退役只落一条：工作票号是 RET-<站编号> 口径，先按票号再按任务去重。
  return rows.find(
    (row) =>
      String(row['工作任务'] ?? '') === `${stationName}退役办结，设备停运、台账归档` ||
      String(row['工作票号'] ?? '').startsWith('RET-'),
  )
}

export function completeRetirement(ledgerId: number, operator: Operator): ActionResult {
  const entries = substationLedger()
  const entry = entries.find((item) => item.id === ledgerId && item.type === 'retirement')
  if (!entry) {
    return { ok: false, message: '没有找到这条退役申请' }
  }
  if (entry.status !== '办理中') {
    return { ok: false, message: `退役申请已${entry.status}，不能重复办结` }
  }
  const view = stationViewById(entry.stationId)
  if (!view) {
    return { ok: false, message: '退役对应的变电站已不存在' }
  }
  if (String(view.row.status) === RETIRED_STATUS) {
    return { ok: false, message: '该站已经是退役办结状态，重复办结不再处理' }
  }
  if (operator.stationName !== view.ownerStationName) {
    return denied(view, operator, '办结退役',
      `越权退回：${view.row.站名}归${view.ownerStationName}管辖，${operator.stationName}的值班人不能办结退役`)
  }

  // 1) 站状态改为已退役，整条台账从此只读。
  const stations = stationRows()
  const sIndex = stations.findIndex((row) => Number(row.id) === entry.stationId)
  if (sIndex < 0) {
    return { ok: false, message: '退役对应的变电站已不存在' }
  }
  stations[sIndex] = {
    ...stations[sIndex],
    status: RETIRED_STATUS,
    pending: false,
    站点状态: RETIRED_STATUS,
  }
  saveStations(stations)

  // 2) 退役办结的结论落到工作票许可的待办理清单（同一座站只落一条）。
  const permits = listRows(WORKPERMIT_KEY)
  const stationName = String(stations[sIndex].站名)
  let permitNote = '已生成待办理工作票'
  if (!existingRetirementPermit(stationName, permits)) {
    permits.push({
      id: nextRowId(permits),
      status: '待签发',
      pending: true,
      abnormal: false,
      工作票号: `RET-${String(entry.stationId).padStart(4, '0')}`,
      工作任务: `${stationName}退役办结，设备停运、台账归档`,
      所属变电站: stationName,
      停电范围: '全站停运',
      工作负责人: operator.name,
      许可时间: '',
      终结时间: '',
      许可状态: '待签发',
    })
    saveRows(WORKPERMIT_KEY, permits)
  } else {
    permitNote = '待办理清单中已有该站退役工作票，未重复落单'
  }

  // 3) 在办改动随退役一并终止，原经办人留在历史里。
  for (const item of entries) {
    if (
      item.stationId === entry.stationId &&
      item.type === 'field-change' &&
      item.status === '办理中'
    ) {
      item.status = '已退回'
      item.handledBy = operator.id
      item.handledByName = operator.name
      item.handledAt = nowText()
      item.rejectReason = '退役办结，未生效改动一并终止'
      item.note = '随退役终止，未写入台账'
    }
  }
  entry.status = '已办结'
  entry.handledBy = operator.id
  entry.handledByName = operator.name
  entry.handledAt = nowText()
  entry.note = permitNote
  saveLedger(entries)

  return { ok: true, message: `${stationName}退役已办结，整条台账锁为只读；结论已落到工作票许可待办理清单（${permitNote}）` }
}

export function rejectRetirement(ledgerId: number, operator: Operator, rejectReason: string): ActionResult {
  const entries = substationLedger()
  const entry = entries.find((item) => item.id === ledgerId && item.type === 'retirement')
  if (!entry) {
    return { ok: false, message: '没有找到这条退役申请' }
  }
  if (entry.status !== '办理中') {
    return { ok: false, message: `退役申请已${entry.status}，不能重复处理` }
  }
  const view = stationViewById(entry.stationId)
  if (!view) {
    return { ok: false, message: '退役对应的变电站已不存在' }
  }
  if (operator.stationName !== view.ownerStationName) {
    return denied(view, operator, '退回退役',
      `越权退回：${view.row.站名}归${view.ownerStationName}管辖，${operator.stationName}的值班人不能处理该所的退役申请`)
  }
  if (!rejectReason.trim()) {
    return { ok: false, message: '退回必须写明理由' }
  }
  entry.status = '已退回'
  entry.handledBy = operator.id
  entry.handledByName = operator.name
  entry.handledAt = nowText()
  entry.rejectReason = rejectReason.trim()
  saveLedger(entries)
  return { ok: true, message: `退役申请已退回：${rejectReason.trim()}（原经办人 ${entry.createdByName}）` }
}

// ── 状态流转（提交投运 / 安排检修）：同样只认归属所，退役后只读 ─────────

export function runStationStatusAction(
  stationId: number,
  action: string,
  target: string,
  operator: Operator,
): ActionResult {
  const view = stationViewById(stationId)
  if (!view) {
    return { ok: false, message: `没有找到编号为 ${stationId} 的变电站` }
  }
  const perms = stationPerms(view, operator)
  if (!perms.canManage) {
    return denied(view, operator, action, perms.actionBlockedReason)
  }
  const current = String(view.row.status)
  if (current === target) {
    return { ok: false, message: `变电站已经是「${target}」，不用重复操作` }
  }
  const rows = stationRows()
  const index = rows.findIndex((row) => Number(row.id) === stationId)
  rows[index] = { ...rows[index], status: target, pending: target !== RETIRED_STATUS, 站点状态: target }
  saveStations(rows)
  appendLedger({
    stationId,
    stationName: String(rows[index].站名),
    type: 'action',
    status: '已办结',
    changes: { 站点状态: { from: current, to: target } },
    reason: action,
    note: '',
    createdBy: operator.id,
    createdByName: operator.name,
    createdAt: nowText(),
    handlerId: operator.id,
    handlerName: operator.name,
    handledBy: operator.id,
    handledByName: operator.name,
    handledAt: nowText(),
    rejectReason: '',
  })
  return { ok: true, message: `变电站已${action}，当前状态「${target}」` }
}

// ── 交接班：没办完的改动/退役跟着同所接班人走，原经办人栏不动 ──────────

export function handoverShift(from: Operator, to: Operator): ActionResult {
  if (from.id === to.id) {
    return { ok: false, message: '接班人不能是经办人自己' }
  }
  if (from.stationId !== to.stationId) {
    return { ok: false, message: `交接班只能在${from.stationName}内部进行，${to.name}属于${to.stationName}` }
  }
  const entries = substationLedger()
  const carried = entries.filter(
    (entry) =>
      entry.handlerId === from.id &&
      entry.status === '办理中' &&
      (entry.type === 'field-change' || entry.type === 'retirement'),
  )
  for (const entry of carried) {
    entry.handlerId = to.id
    entry.handlerName = to.name
  }
  // 每个站留一条交接班流水；没有在办事项的站也记录交接班事实。
  const touchedStations = new Set(carried.map((entry) => entry.stationId))
  for (const stationId of touchedStations) {
    const view = stationViewById(stationId)
    entries.push({
      id: nextCollectionId(entries),
      stationId,
      stationName: view ? String(view.row.站名) : `#${stationId}`,
      type: 'handover',
      status: '已办结',
      changes: { 经办人: { from: from.name, to: to.name } },
      reason: '交接班',
      note: '在办事项随接班人继续办理，原经办人留在历史记录里',
      createdBy: from.id,
      createdByName: from.name,
      createdAt: nowText(),
      handlerId: to.id,
      handlerName: to.name,
      handledBy: to.id,
      handledByName: to.name,
      handledAt: nowText(),
      rejectReason: '',
    })
  }
  saveLedger(entries)
  return {
    ok: true,
    message:
      carried.length > 0
        ? `交接班完成：${carried.length} 条在办事项已转给${to.name}，原经办人 ${from.name} 留在历史里`
        : `交接班完成：当前没有转给${to.name}的在办事项`,
  }
}

export function pendingHandledBy(operator: Operator): SubstationLedgerEntry[] {
  return substationLedger().filter(
    (entry) =>
      entry.handlerId === operator.id &&
      entry.status === '办理中' &&
      (entry.type === 'field-change' || entry.type === 'retirement'),
  )
}

// ── 重置：台账、归属流水、退役工作票一并回到示例 ────────────────────────

export function resetSubstationDomain(): void {
  resetRows(SUBSTATION_KEY)
  resetCollection(LEDGER_KEY, SEED_SUBSTATION_LEDGER)
  // 清掉此前退役办结生成的工作票，只移除 RET- 票号的联动票。
  const permits = listRows(WORKPERMIT_KEY).filter(
    (row) => !String(row['工作票号'] ?? '').startsWith('RET-'),
  )
  saveRows(WORKPERMIT_KEY, permits)
}

// 兼容旧调用：local-service 重置模块时按模块键收口。
export function resetSubstationLedger(): void {
  resetCollection(LEDGER_KEY, SEED_SUBSTATION_LEDGER)
}

// 给页面/测试用：解析值班人。
export { operatorById }
