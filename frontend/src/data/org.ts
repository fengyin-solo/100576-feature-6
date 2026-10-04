import type { Operator, PowerStation } from './types'

// 供电所口径：变电站归属只认这一份名册，移交记录也只能移交给名册里的所。
export const POWER_STATIONS: PowerStation[] = [
  { id: 'chengdong', name: '城东供电所' },
  { id: 'chengxi', name: '城西供电所' },
  { id: 'chengnan', name: '城南供电所' },
  { id: 'chengbei', name: '城北供电所' },
]

// 值班人：每人只属于一个供电所。站挂在谁名下，就只有同所的值班人能动。
export const OPERATORS: Operator[] = [
  { id: 'u-zhouming', name: '周明', stationId: 'chengdong', stationName: '城东供电所' },
  { id: 'u-zhenglan', name: '郑岚', stationId: 'chengdong', stationName: '城东供电所' },
  { id: 'u-hanxue', name: '韩雪', stationId: 'chengxi', stationName: '城西供电所' },
  { id: 'u-lifeng', name: '李锋', stationId: 'chengxi', stationName: '城西供电所' },
  { id: 'u-wangqiang', name: '王强', stationId: 'chengnan', stationName: '城南供电所' },
  { id: 'u-zhaoxia', name: '赵霞', stationId: 'chengnan', stationName: '城南供电所' },
  { id: 'u-chenhao', name: '陈昊', stationId: 'chengbei', stationName: '城北供电所' },
  { id: 'u-sunlei', name: '孙磊', stationId: 'chengbei', stationName: '城北供电所' },
]

export function operatorById(id: string): Operator {
  const found = OPERATORS.find((item) => item.id === id)
  if (!found) {
    throw new Error(`值班人名册里没有编号为 ${id} 的人员`)
  }
  return found
}

export function stationOperators(stationId: string): Operator[] {
  return OPERATORS.filter((item) => item.stationId === stationId)
}
