import type { SubstationLedgerEntry } from './types'

// 归属台账初始流水：重置变电站台账时回到这一份。
// 注意白鹤站台账里的「所属供电所」仍写着城东供电所，但最近一条移交记录
// 已把它交给城西供电所——归属一律以最近一次移交记录为准。
export const SEED_SUBSTATION_LEDGER: SubstationLedgerEntry[] = [
  {
    id: 1,
    stationId: 2,
    stationName: '城西220kV白鹤变电站',
    type: 'transfer',
    status: '已办结',
    changes: { 所属供电所: { from: '城东供电所', to: '城西供电所' } },
    reason: '行政区划调整，白鹤站运维责任移交城西片区',
    note: '移交即时生效',
    createdBy: 'u-zhouming',
    createdByName: '周明',
    createdAt: '2026-09-15 09:20',
    handlerId: 'u-zhouming',
    handlerName: '周明',
    handledBy: 'u-zhouming',
    handledByName: '周明',
    handledAt: '2026-09-15 09:20',
    rejectReason: '',
  },
  {
    id: 2,
    stationId: 3,
    stationName: '城南35kV青山变电站',
    type: 'field-change',
    status: '办理中',
    changes: { 接线方式: { from: '线路变压器组接线', to: '单母线接线' } },
    reason: '结合秋检完善接线方式台账',
    note: '',
    createdBy: 'u-wangqiang',
    createdByName: '王强',
    createdAt: '2026-09-28 14:05',
    handlerId: 'u-wangqiang',
    handlerName: '王强',
    handledBy: '',
    handledByName: '',
    handledAt: '',
    rejectReason: '',
  },
]
