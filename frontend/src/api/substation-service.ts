import { moduleMeta, runAction as applyModuleAction, filterRows } from '@/api/local-service'
import { listRows, saveRows } from '@/data/local-store'
import { appendLedgerRecord, ledgerRecords } from '@/data/substation-ledger'
import type { ActionResult, EntryRow, LedgerRecord } from '@/data/types'

// 变电站名册的归属规则都收在这一层：页面只渲染，不做业务判断。
// 一座站挂在哪个供电所名下，站名、电压等级、接线方式就只有该所值班人能动；
// 越权提交一律退回并写明理由；退役办结后整条记录只读。

export type Actor = {
  operator: string
  station: string
}

const MODULE_KEY = 'substation'
const RETIRE_ACTION = '办理退役'
const RETIRE_PERMIT_TASK = '退役办结'

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 兼容早期没有经办人字段的台账：读出来时补齐，不强行落库。 */
function normalize(row: EntryRow): EntryRow {
  if (row['当前经办人'] !== undefined && row['当前经办人'] !== '') {
    return row
  }
  return { ...row, 当前经办人: row['站长'] ?? '未指派' }
}

function findRow(id: number): EntryRow | null {
  const row = listRows(MODULE_KEY).find((item) => Number(item.id) === id)
  return row ? normalize(row) : null
}

function isRetired(row: EntryRow): boolean {
  return String(row.status) === '已退役'
}

export function canEditSubstation(row: EntryRow, actor: Actor): boolean {
  return !isRetired(row) && String(row['所属供电所']) === actor.station
}

function record(substationId: number, entry: Omit<LedgerRecord, 'time'>): void {
  appendLedgerRecord(substationId, { time: now(), ...entry })
}

/** 站名口径：列表与详情抽屉共用这一处解析，冲突时以最近一次带快照的记录（移交/修改）为准。 */
export function resolveSubstationName(row: EntryRow): string {
  const records = ledgerRecords(Number(row.id))
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const snapshot = records[i].snapshotName
    if (snapshot) {
      return snapshot
    }
  }
  return String(row['站名'] ?? '')
}

export function listSubstations(filters: Record<string, string> = {}): { items: EntryRow[]; total: number } {
  const matched = filterRows(listRows(MODULE_KEY).map(normalize), filters)
  return { items: matched, total: matched.length }
}

export function getSubstation(id: number): EntryRow | null {
  return findRow(id)
}

export function getSubstationLedger(id: number): LedgerRecord[] {
  return ledgerRecords(id)
}

/** 名册里出现过的供电所口径，供切换值班身份时选择。 */
export function knownStations(): string[] {
  const names = listRows(MODULE_KEY).map((row) => String(row['所属供电所'] ?? '')).filter(Boolean)
  return [...new Set(names)]
}

function reject(row: EntryRow, actor: Actor, action: string, reason: string): ActionResult {
  record(Number(row.id), {
    operator: actor.operator,
    station: actor.station,
    action,
    detail: reason,
    result: '已退回',
  })
  return { ok: false, message: reason }
}

/** 归属与只读守门：返回 null 表示放行，否则是已经留档的退回结论。 */
function guard(row: EntryRow, actor: Actor, action: string): ActionResult | null {
  const name = resolveSubstationName(row)
  if (isRetired(row)) {
    return reject(row, actor, action, `退回：「${name}」已退役办结，整条记录锁定为只读，站名、电压等级、接线方式与状态都不能再动`)
  }
  if (String(row['所属供电所']) !== actor.station) {
    return reject(
      row,
      actor,
      action,
      `越权退回：「${name}」挂在${String(row['所属供电所'])}名下，当前值班身份属于${actor.station}，只有${String(row['所属供电所'])}的值班人能改动，其他所仅可查看`,
    )
  }
  return null
}

/** 改站名、电压等级、接线方式：只有所属供电所的值班人能动。 */
export function updateSubstationProfile(
  id: number,
  patch: { 站名?: string; 电压等级?: string; 接线方式?: string },
  actor: Actor,
): ActionResult {
  const row = findRow(id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的变电站` }
  }
  const blocked = guard(row, actor, '修改台账')
  if (blocked) {
    return blocked
  }
  const fields = ['站名', '电压等级', '接线方式'] as const
  const changes: string[] = []
  const updated: EntryRow = { ...row }
  for (const field of fields) {
    const nextValue = (patch[field] ?? '').trim()
    if (nextValue === '') {
      return reject(row, actor, '修改台账', `退回：${field}不能为空，本次修改未受理`)
    }
    if (nextValue !== String(row[field] ?? '')) {
      changes.push(`${field}：${String(row[field] ?? '—')} → ${nextValue}`)
      updated[field] = nextValue
    }
  }
  if (changes.length === 0) {
    return { ok: false, message: '提交的内容与台账一致，没有需要修改的项' }
  }
  const rows = listRows(MODULE_KEY).map((item) => (Number(item.id) === id ? updated : item))
  saveRows(MODULE_KEY, rows)
  record(id, {
    operator: actor.operator,
    station: actor.station,
    action: '修改台账',
    detail: changes.join('；'),
    result: '已受理',
    snapshotName: String(updated['站名']),
  })
  return { ok: true, message: `台账已更新：${changes.join('；')}` }
}

/** 状态流转（提交投运/安排检修/办理退役）：先过归属守门，退役办结联动工作票许可待办。 */
export function runSubstationAction(id: number, action: string, actor: Actor): ActionResult {
  const meta = moduleMeta(MODULE_KEY)
  const row = findRow(id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的变电站` }
  }
  if (!meta.actions.includes(action)) {
    return { ok: false, message: `变电站没有登记「${action}」这个动作` }
  }
  const blocked = guard(row, actor, action)
  if (blocked) {
    return blocked
  }
  const result = applyModuleAction(MODULE_KEY, id, action)
  if (!result.ok) {
    return result
  }
  const name = resolveSubstationName(row)
  record(id, {
    operator: actor.operator,
    station: actor.station,
    action,
    detail: `状态流转为「${meta.actionTargets[action]}」`,
    result: '已受理',
    snapshotName: name,
  })
  if (action !== RETIRE_ACTION) {
    return result
  }
  const created = ensureRetirementWorkPermit(row, actor)
  return {
    ok: true,
    message: created
      ? `${result.message}；退役办结结论已落入工作票许可待办理清单`
      : `${result.message}；工作票许可待办理清单已有该站退役办结记录，未重复落单`,
  }
}

/** 退役办结结论落到工作票许可待办理清单；同一座站只落一条。 */
function ensureRetirementWorkPermit(row: EntryRow, actor: Actor): boolean {
  const name = resolveSubstationName(row)
  const permits = listRows('workpermit')
  const duplicated = permits.some(
    (permit) =>
      String(permit['所属变电站']) === name &&
      String(permit['工作任务']).startsWith(RETIRE_PERMIT_TASK),
  )
  if (duplicated) {
    return false
  }
  const nextId = permits.reduce((max, permit) => Math.max(max, Number(permit.id) || 0), 0) + 1
  const conclusion = `${RETIRE_PERMIT_TASK}：${name}（${String(row['电压等级'])}）退出运行，名册已锁只读，待办理许可手续`
  saveRows('workpermit', [
    ...permits,
    {
      id: nextId,
      status: '待签发',
      pending: true,
      abnormal: false,
      工作票号: `TYJ-${String(nextId).padStart(4, '0')}`,
      工作任务: conclusion,
      所属变电站: name,
      停电范围: '全站',
      工作负责人: actor.operator,
      许可时间: '',
      终结时间: '',
      许可状态: '待签发',
    },
  ])
  return true
}

/** 交接班：本所没办完的事项跟着接班人走，原经办人留在历史里。 */
export function handoverSubstationShift(actor: Actor, nextOperator: string, nextShiftLabel: string): ActionResult {
  const successor = nextOperator.trim()
  if (successor === '') {
    return { ok: false, message: '接班人姓名不能为空' }
  }
  if (successor === actor.operator) {
    return { ok: false, message: '接班人与当前值班人相同，无需交接' }
  }
  let moved = 0
  const rows = listRows(MODULE_KEY).map((item) => {
    const row = normalize(item)
    const handoverable =
      String(row['所属供电所']) === actor.station &&
      String(row['当前经办人']) === actor.operator &&
      row.pending === true &&
      !isRetired(row)
    if (!handoverable) {
      return row
    }
    moved += 1
    record(Number(row.id), {
      operator: actor.operator,
      station: actor.station,
      action: '交接班移交',
      detail: `交接班（${nextShiftLabel}）：在办事项由${actor.operator}移交给${successor}，原经办人留档`,
      result: '已受理',
      snapshotName: resolveSubstationName(row),
    })
    return { ...row, 当前经办人: successor }
  })
  if (moved > 0) {
    saveRows(MODULE_KEY, rows)
  }
  return {
    ok: true,
    message:
      moved > 0
        ? `交接班完成：${moved} 项在办事项已随班移交给${successor}（${nextShiftLabel}）`
        : `交接班完成：${actor.station}当前没有${actor.operator}名下的在办事项需要移交`,
  }
}
