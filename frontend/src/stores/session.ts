import { defineStore } from 'pinia'

import { operatorById, OPERATORS } from '@/data/org'
import type { Operator } from '@/data/types'

const SESSION_KEY = 'substation-protection:session-operator'
const DEFAULT_OPERATOR_ID = 'u-zhouming'

function loadOperatorId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_OPERATOR_ID
  }
  const saved = window.localStorage.getItem(SESSION_KEY)
  return saved && OPERATORS.some((item) => item.id === saved) ? saved : DEFAULT_OPERATOR_ID
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    operatorId: loadOperatorId(),
    shiftLabel: '白班 08:00-20:00',
    scope: '变电站继电保护定值整定与二次设备检修管理平台',
  }),
  getters: {
    operator(state): Operator {
      return operatorById(state.operatorId)
    },
    operatorName(): string {
      return this.operator.name
    },
    stationName(): string {
      return this.operator.stationName
    },
    canOperate(): boolean {
      return this.operator.id.length > 0
    },
  },
  actions: {
    setOperator(id: string) {
      this.operatorId = operatorById(id).id
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, this.operatorId)
      }
    },
    setShift(label: string) {
      this.shiftLabel = label
    },
  },
})
