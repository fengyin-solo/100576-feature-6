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

/** 变电站名册的变更/移交记录：谁在什么时间做了什么，退回也留理由。 */
export type LedgerRecord = {
  time: string
  operator: string
  station: string
  action: string
  detail: string
  result: '已受理' | '已退回'
  /** 受理时认可的站名快照：列表与详情口径冲突时，以最近一次带快照的记录为准。 */
  snapshotName?: string
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
