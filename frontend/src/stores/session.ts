import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    station: '城东供电所',
    shiftLabel: '白班 08:00-20:00',
    scope: '变电站继电保护定值整定与二次设备检修管理平台',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    /** 交接班：供电所不变，值班人与班次换成接班的一班。 */
    handoverTo(operator: string, shiftLabel: string) {
      this.operator = operator
      this.shiftLabel = shiftLabel
    },
    /** 切换值班身份到别的供电所：用于查看他所名册（只读）。 */
    switchStation(station: string, operator: string) {
      this.station = station
      this.operator = operator
    },
  },
})
