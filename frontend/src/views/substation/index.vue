<template>
  <section class="page" data-module="substation">
    <header class="page-head">
      <div>
        <h2>变电站台账管理</h2>
        <p class="page-desc">名册按供电所归属管理：站名、电压等级、接线方式只有所属供电所的值班人能改，其他所仅可查看；退役办结后整条只读。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记变电站</button>
        <button class="btn" type="button" @click="exportRows">导出变电站台账清单</button>
      </div>
    </header>

    <div class="identity-bar">
      <span class="identity-current">
        当前值班：{{ session.operator }} · {{ session.station }} · {{ session.shiftLabel }}
      </span>
      <form class="identity-form" @submit.prevent="submitHandover">
        <label class="filter-item">
          <span>接班人</span>
          <input v-model="handoverForm.operator" placeholder="接班人姓名" />
        </label>
        <label class="filter-item">
          <span>接班班次</span>
          <select v-model="handoverForm.shiftLabel">
            <option v-for="shift in shiftOptions" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
        <button class="btn" type="submit">办理交接班</button>
      </form>
      <form class="identity-form" @submit.prevent="submitSwitch">
        <label class="filter-item">
          <span>切换供电所</span>
          <select v-model="switchForm.station">
            <option v-for="station in stationOptions" :key="station" :value="station">{{ station }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>值班人</span>
          <input v-model="switchForm.operator" placeholder="值班人姓名" />
        </label>
        <button class="btn ghost" type="submit">切换值班身份</button>
      </form>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in viewRows" :key="String(item.row.id)">
          <td v-for="column in columns" :key="column">
            {{ column === '站名' ? item.name : (item.row[column] ?? '—') }}
          </td>
          <td>
            {{ item.row.status }}
            <span v-if="item.retired" class="tag readonly-tag">只读</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDrawer(Number(item.row.id))">详情</button>
            <template v-if="item.editable">
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                @click="runAction(action, Number(item.row.id))"
              >
                {{ action }}
              </button>
            </template>
            <span v-else-if="item.retired" class="muted-text">已退役办结</span>
            <span v-else class="muted-text">仅可查看</span>
          </td>
        </tr>
        <tr v-if="!viewRows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无变电站台账数据，可先登记变电站</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条变电站台账记录</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <template v-if="drawerRow">
      <div class="drawer-mask" @click="closeDrawer"></div>
      <aside class="drawer" data-module="substation-drawer">
        <header class="drawer-head">
          <div>
            <h3>{{ drawerName }}</h3>
            <p class="drawer-sub">
              {{ drawerRow.status }}
              <span v-if="drawerRetired" class="tag readonly-tag">已退役·只读</span>
              <span v-else-if="!drawerEditable" class="tag">仅可查看</span>
            </p>
          </div>
          <button class="btn ghost" type="button" @click="closeDrawer">关闭</button>
        </header>
        <div class="drawer-body">
          <dl class="detail-grid">
            <template v-for="column in columns" :key="column">
              <dt>{{ column }}</dt>
              <dd>{{ column === '站名' ? drawerName : (drawerRow[column] ?? '—') }}</dd>
            </template>
            <dt>当前状态</dt>
            <dd>{{ drawerRow.status }}</dd>
          </dl>

          <section class="drawer-section">
            <h4>修改台账（站名 / 电压等级 / 接线方式）</h4>
            <template v-if="drawerEditable">
              <form class="drawer-form" @submit.prevent="submitProfile">
                <label v-for="field in editableFields" :key="field" class="filter-item">
                  <span>{{ field }}</span>
                  <input v-model="profileForm[field]" :placeholder="`填写${field}`" />
                </label>
                <button class="btn primary" type="submit">提交修改</button>
              </form>
            </template>
            <p v-else class="muted-text">{{ drawerLockedReason }}</p>
          </section>

          <section class="drawer-section" v-if="drawerEditable">
            <h4>状态流转</h4>
            <div class="row-actions">
              <button
                v-for="action in actions"
                :key="action"
                class="btn"
                type="button"
                @click="runAction(action, Number(drawerRow.id))"
              >
                {{ action }}
              </button>
            </div>
          </section>

          <section class="drawer-section">
            <h4>变更与移交记录</h4>
            <ol class="history-list">
              <li v-for="(entry, index) in drawerLedger" :key="index" class="history-item">
                <span class="history-time">{{ entry.time }}</span>
                <span class="history-main">
                  {{ entry.operator }}（{{ entry.station }}）· {{ entry.action }}
                  <em class="tag" :class="entry.result === '已退回' ? 'reject-tag' : 'accept-tag'">{{ entry.result }}</em>
                </span>
                <span class="history-detail">{{ entry.detail }}</span>
              </li>
              <li v-if="!drawerLedger.length" class="muted-text">暂无变更记录</li>
            </ol>
          </section>
        </div>
      </aside>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import {
  canEditSubstation,
  getSubstation,
  getSubstationLedger,
  handoverSubstationShift,
  knownStations,
  listSubstations,
  resolveSubstationName,
  runSubstationAction,
  updateSubstationProfile,
} from '@/api/substation-service'
import type { EntryRow, LedgerRecord } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const MODULE_KEY = 'substation'
const columns = ["站名", "电压等级", "所属供电所", "主变台数", "投运日期", "站长", "接线方式", "站点状态", "当前经办人"]
const actions = ["提交投运", "安排检修", "办理退役"]
const statuses = ["待投运", "运行中", "检修中", "已退役"]
const editableFields = ["站名", "电压等级", "接线方式"] as const
const shiftOptions = ["白班 08:00-20:00", "夜班 20:00-08:00"]

const session = useSessionStore()
const actor = computed(() => ({ operator: session.operator, station: session.station }))

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const stationOptions = ref<string[]>([])

const handoverForm = reactive({ operator: '', shiftLabel: shiftOptions[1] })
const switchForm = reactive({ station: '', operator: '' })

const drawerRow = ref<EntryRow | null>(null)
const drawerLedger = ref<LedgerRecord[]>([])
const profileForm = reactive<Record<(typeof editableFields)[number], string>>({
  站名: '',
  电压等级: '',
  接线方式: '',
})

const stats = computed(() => [
  { label: '运行中变电站', value: countByStatus('运行中') },
  { label: '检修中变电站', value: countByStatus('检修中') },
  { label: '待投运变电站', value: countByStatus('待投运') },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({ status, count: countByStatus(status) })),
)
const viewRows = computed(() =>
  rows.value.map((row) => ({
    row,
    name: resolveSubstationName(row),
    retired: String(row.status) === '已退役',
    editable: canEditSubstation(row, actor.value),
  })),
)

const drawerName = computed(() => (drawerRow.value ? resolveSubstationName(drawerRow.value) : ''))
const drawerRetired = computed(() => String(drawerRow.value?.status) === '已退役')
const drawerEditable = computed(() =>
  drawerRow.value ? canEditSubstation(drawerRow.value, actor.value) : false,
)
const drawerLockedReason = computed(() => {
  if (!drawerRow.value) {
    return ''
  }
  if (drawerRetired.value) {
    return '该站已退役办结，整条记录锁定为只读。'
  }
  return `该站挂在${String(drawerRow.value['所属供电所'])}名下，当前值班身份仅可查看。`
})

function countByStatus(status: string): number {
  return rows.value.filter((row) => String(row.status) === status).length
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(MODULE_KEY)
}

function openCreate() {
  errorMessage.value = '变电站登记入口尚未接入审批流'
}

function runAction(action: string, id: number) {
  clearMessages()
  const result = runSubstationAction(id, action, actor.value)
  if (!result.ok) {
    errorMessage.value = result.message
    refreshDrawer(id)
    return
  }
  noticeMessage.value = result.message
  reload()
  refreshDrawer(id)
}

function openDrawer(id: number) {
  const row = getSubstation(id)
  if (!row) {
    errorMessage.value = `没有找到编号为 ${id} 的变电站`
    return
  }
  drawerRow.value = row
  drawerLedger.value = getSubstationLedger(id)
  profileForm.站名 = resolveSubstationName(row)
  profileForm.电压等级 = String(row['电压等级'] ?? '')
  profileForm.接线方式 = String(row['接线方式'] ?? '')
}

function closeDrawer() {
  drawerRow.value = null
}

function refreshDrawer(id: number) {
  if (drawerRow.value && Number(drawerRow.value.id) === id) {
    const row = getSubstation(id)
    if (row) {
      drawerRow.value = row
    }
    drawerLedger.value = getSubstationLedger(id)
  }
}

function submitProfile() {
  if (!drawerRow.value) {
    return
  }
  clearMessages()
  const id = Number(drawerRow.value.id)
  const result = updateSubstationProfile(id, { ...profileForm }, actor.value)
  if (!result.ok) {
    errorMessage.value = result.message
    refreshDrawer(id)
    return
  }
  noticeMessage.value = result.message
  reload()
  refreshDrawer(id)
}

function submitHandover() {
  clearMessages()
  const result = handoverSubstationShift(actor.value, handoverForm.operator, handoverForm.shiftLabel)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  session.handoverTo(handoverForm.operator.trim(), handoverForm.shiftLabel)
  noticeMessage.value = result.message
  handoverForm.operator = ''
  reload()
}

function submitSwitch() {
  clearMessages()
  const station = switchForm.station || session.station
  const operator = switchForm.operator.trim() || `${station}值班员`
  session.switchStation(station, operator)
  noticeMessage.value = `已切换为${station}值班身份：本所站点可办理，其他所站点仅可查看`
  switchForm.operator = ''
  reload()
}

function clearMessages() {
  errorMessage.value = ''
  noticeMessage.value = ''
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listSubstations(filters.value)
    rows.value = payload.items
    total.value = payload.total
    stationOptions.value = knownStations()
    if (!switchForm.station || !stationOptions.value.includes(switchForm.station)) {
      switchForm.station = session.station
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '变电站台账列表读取失败'
  }
}

onMounted(reload)
</script>
