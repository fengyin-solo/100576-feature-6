<template>
  <section class="page" data-module="substation">
    <header class="page-head">
      <div>
        <h2>变电站台账管理</h2>
        <p class="page-desc">
          一座站挂在哪个供电所名下，站名、电压等级与接线方式就只有该所值班人能动；越权提交一律退回并写明理由。退役办结整条锁为只读，别的所只能查看。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openHandover">交接班</button>
        <button class="btn" type="button" @click="exportRows">导出变电站台账清单</button>
        <button class="btn ghost" type="button" @click="resetAll">重置示例数据</button>
      </div>
    </header>

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
      <span class="legend-item mine">本所名下：{{ mineCount }} 座</span>
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
        <tr
          v-for="view in filteredViews"
          :key="String(view.row.id)"
          :class="{ 'is-retired': permsOf(view).retired, 'is-other': !permsOf(view).canManage && !permsOf(view).retired }"
        >
          <td>
            <button class="link station-link" type="button" @click="openDrawer(view)">{{ view.row['站名'] }}</button>
          </td>
          <td>{{ view.row['电压等级'] }}</td>
          <td>
            {{ view.ownerStationName }}
            <span v-if="view.ownerConflict" class="owner-tag" title="台账原口径与移交记录不一致，归属以最近一次移交记录为准">
              （移交自{{ view.row['所属供电所'] }}）
            </span>
          </td>
          <td>{{ view.row['主变台数'] }}</td>
          <td>{{ view.row['投运日期'] || '—' }}</td>
          <td>{{ view.row['站长'] }}</td>
          <td>{{ view.row['接线方式'] }}</td>
          <td>{{ view.row['站点状态'] }}</td>
          <td>
            <span v-if="view.activeRetirement" class="pending-tag">退役申请办理中（{{ view.activeRetirement.handlerName }}）</span>
            <span v-else-if="view.activeChange" class="pending-tag">改动办理中（{{ view.activeChange.handlerName }}）</span>
          </td>
          <td>{{ view.row.status }}</td>
          <td class="row-actions">
            <template v-if="permsOf(view).retired">
              <span class="readonly-tag">已退役·只读</span>
            </template>
            <template v-else-if="!permsOf(view).canManage">
              <span class="readonly-tag" :title="permsOf(view).actionBlockedReason">仅查看（{{ view.ownerStationName }}管辖）</span>
            </template>
            <template v-else>
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                :disabled="!!view.activeRetirement"
                :title="view.activeRetirement ? '退役申请办理中，请先办结或退回' : ''"
                @click="runAction(action, view)"
              >
                {{ action }}
              </button>
            </template>
          </td>
        </tr>
        <tr v-if="!filteredViews.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无符合条件的变电站台账</td>
        </tr>      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ filteredViews.length }} 条变电站台账记录；归属口径：以最近一次移交记录为准</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 详情抽屉：站名口径与列表页同源（stationView），不会出现两处不一致 -->
    <div v-if="drawerView" class="drawer-mask" @click.self="closeDrawer">
      <aside class="drawer">
        <header class="drawer-head">
          <div>
            <h3>{{ drawerView.row['站名'] }}</h3>
            <p class="drawer-sub">
              归属：{{ drawerView.ownerStationName }}
              <span v-if="drawerView.ownerConflict" class="owner-tag">
                台账原口径为{{ drawerView.row['所属供电所'] }}，冲突时以最近一次移交记录为准
              </span>
            </p>
          </div>
          <button class="btn ghost" type="button" @click="closeDrawer">关闭</button>
        </header>

        <div v-if="drawerPerms.retired" class="banner warn">该站已办结退役，整条台账锁为只读；退役结论已落入工作票许可待办理清单。</div>
        <div v-else-if="!drawerPerms.canManage" class="banner warn">
          越权保护：该站归{{ drawerView.ownerStationName }}管辖，{{ store.stationName }}的值班人只能查看，改动会被退回并写明理由。
        </div>
        <div v-else-if="drawerView.activeRetirement" class="banner info">
          该站有一条办理中的退役申请（经办人：{{ drawerView.activeRetirement.handlerName }}，原经办人：{{ drawerView.activeRetirement.createdByName }}），办结后整条锁为只读。
        </div>
        <div v-else-if="drawerView.activeChange" class="banner info">
          该站有一条办理中的改动（经办人：{{ drawerView.activeChange.handlerName }}，原经办人：{{ drawerView.activeChange.createdByName }}）。
        </div>

        <section class="drawer-block">
          <h4>台账字段</h4>
          <dl class="field-grid">
            <div v-for="column in columns" :key="column">
              <dt>{{ column }}</dt>
              <dd>{{ drawerView.row[column] || '—' }}</dd>
            </div>
            <div>
              <dt>当前状态</dt>
              <dd>{{ drawerView.row.status }}</dd>
            </div>
          </dl>
        </section>

        <!-- 收权编辑：只有归属所值班人且未退役才能提交 -->
        <section v-if="drawerPerms.canManage && !drawerView.activeRetirement" class="drawer-block">
          <h4>申请改动（站名 / 电压等级 / 接线方式）</h4>
          <p v-if="drawerView.activeChange" class="block-tip">
            已有办理中的改动，请在下方待办里先办结或退回。
          </p>
          <form v-else class="edit-form" @submit.prevent="submitChange">
            <label class="filter-item">
              <span>站名</span>
              <input v-model="changeForm['站名']" />
            </label>
            <label class="filter-item">
              <span>电压等级</span>
              <select v-model="changeForm['电压等级']">
                <option v-for="v in voltageLevels" :key="v" :value="v">{{ v }}</option>
              </select>
            </label>
            <label class="filter-item">
              <span>接线方式</span>
              <select v-model="changeForm['接线方式']">
                <option v-for="v in wiringModes" :key="v" :value="v">{{ v }}</option>
              </select>
            </label>
            <label class="filter-item reason-item">
              <span>改动理由（必填）</span>
              <input v-model="changeForm.reason" placeholder="越权或缺理由的提交一律退回" />
            </label>
            <button class="btn primary" type="submit">提交改动申请</button>
          </form>
        </section>

        <!-- 归属移交 -->
        <section v-if="drawerPerms.canManage" class="drawer-block">
          <h4>归属移交</h4>
          <form class="edit-form inline" @submit.prevent="submitTransfer">
            <label class="filter-item">
              <span>移交至</span>
              <select v-model="transferForm.target">
                <option v-for="s in otherStations" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="filter-item reason-item">
              <span>移交理由（必填）</span>
              <input v-model="transferForm.reason" placeholder="提交即生效，归属以最近移交记录为准" />
            </label>
            <button class="btn" type="button" @click="submitTransfer">办理移交</button>
          </form>
        </section>

        <!-- 退役 -->
        <section v-if="drawerPerms.canManage && !drawerView.activeRetirement" class="drawer-block">
          <h4>办理退役</h4>
          <form class="edit-form inline" @submit.prevent="submitRetire">
            <label class="filter-item reason-item">
              <span>退役理由（必填）</span>
              <input v-model="retireForm.reason" placeholder="同一座站重复提交只落一条" />
            </label>
            <button class="btn primary" type="button" @click="submitRetire">提交退役申请</button>
          </form>
        </section>

        <!-- 待办：办理中的改动/退役，经办人随交接班变化 -->
        <section v-if="drawerTodos.length" class="drawer-block">
          <h4>待办理事项</h4>
          <article v-for="todo in drawerTodos" :key="todo.id" class="todo-card">
            <header>
              <strong>{{ typeLabel(todo.type) }}#{{ todo.id }}（{{ todo.status }}）</strong>
              <span class="muted">经办人：{{ todo.handlerName }} · 原经办人：{{ todo.createdByName }}</span>
            </header>
            <p class="todo-reason">理由：{{ todo.reason }}</p>
            <ul v-if="typeLabel(todo.type) === '改动'" class="change-list">
              <li v-for="(change, key) in todo.changes" :key="key">
                {{ key }}：{{ change.from }} → {{ change.to }}
              </li>
            </ul>
            <div class="todo-actions">
              <button class="btn primary" type="button" @click="completeTodo(todo)">
                {{ todo.type === 'retirement' ? '退役办结（锁定并落工作票）' : '办结并写入台账' }}
              </button>
              <button class="btn" type="button" @click="openReject(todo)">退回（写明理由）</button>
            </div>
          </article>
        </section>

        <!-- 台账流水：原经办人永远留在 createdByName -->
        <section class="drawer-block">
          <h4>台账流水（含移交、改动、退役、交接班、越权留痕）</h4>
          <ol class="timeline">
            <li v-for="entry in timeline" :key="entry.id">
              <div class="timeline-head">
                <span class="timeline-type">{{ typeLabel(entry.type) }}#{{ entry.id }}</span>
                <span :class="['timeline-status', statusClass(entry.status)]">{{ entry.status }}</span>
                <span class="muted">{{ entry.createdAt }}</span>
              </div>
              <div class="timeline-body">{{ entry.reason }}</div>
              <ul v-if="Object.keys(entry.changes).length" class="change-list">
                <li v-for="(change, key) in entry.changes" :key="key">
                  {{ key }}：{{ change.from }} → {{ change.to }}
                </li>
              </ul>
              <div class="timeline-foot muted">
                原经办人：{{ entry.createdByName }}
                <template v-if="entry.handledByName && entry.handledByName !== entry.createdByName">
                  · 办结经办人：{{ entry.handledByName }}
                </template>
                <template v-if="entry.handledAt"> · {{ entry.handledAt }}</template>
                <template v-if="entry.rejectReason"> · 退回理由：{{ entry.rejectReason }}</template>
                <template v-if="entry.note"> · {{ entry.note }}</template>
              </div>
            </li>
          </ol>
        </section>
      </aside>
    </div>

    <!-- 退回理由弹窗 -->
    <div v-if="rejectTarget" class="drawer-mask" @click.self="rejectTarget = null">
      <div class="modal">
        <h3>退回{{ typeLabel(rejectTarget.type) }}#{{ rejectTarget.id }}</h3>
        <textarea v-model="rejectReasonText" rows="3" placeholder="必须写明退回理由"></textarea>
        <div class="modal-actions">
          <button class="btn" type="button" @click="rejectTarget = null">取消</button>
          <button class="btn primary" type="button" @click="confirmReject">确认退回</button>
        </div>
      </div>
    </div>

    <!-- 交接班弹窗 -->
    <div v-if="handoverOpen" class="drawer-mask" @click.self="handoverOpen = false">
      <div class="modal">
        <h3>交接班（{{ store.stationName }}）</h3>
        <p class="muted">交班人：{{ store.operatorName }}。没办完的改动与退役申请会转给同所接班人，原经办人栏保留在历史里。</p>
        <p v-if="myPending.length" class="block-tip">
          将转交 {{ myPending.length }} 条在办事项：
          <span v-for="item in myPending" :key="item.id">
            「{{ item.stationName }}·{{ typeLabel(item.type) }}#{{ item.id }}」
          </span>
        </p>
        <label class="filter-item">
          <span>接班人（限{{ store.stationName }}值班人）</span>
          <select v-model="handoverTargetId">
            <option value="" disabled>请选择接班人</option>
            <option v-for="op in sameStationOperators" :key="op.id" :value="op.id">{{ op.name }}（{{ op.stationName }}）</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn" type="button" @click="handoverOpen = false">取消</button>
          <button class="btn primary" type="button" :disabled="!handoverTargetId" @click="confirmHandover">完成交接</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries, listEntries, moduleMeta, runAction as applyAction } from '@/api/local-service'
import {
  completeFieldChange,
  completeRetirement,
  handoverShift,
  listStationViews,
  pendingHandledBy,
  rejectFieldChange,
  rejectRetirement,
  resetSubstationDomain,
  stationPerms,
  stationTimeline,
  submitFieldChange,
  submitRetirement,
  transferStation,
  VOLTAGE_LEVELS,
  WIRING_MODES,
} from '@/api/substation-domain'
import { POWER_STATIONS, stationOperators } from '@/data/org'
import type { SubstationLedgerEntry, SubstationView } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

const meta = moduleMeta('substation')
const columns = ['站名', '电压等级', '所属供电所', '主变台数', '投运日期', '站长', '接线方式', '站点状态']
const actions = ['提交投运', '安排检修', '办理退役']
const statuses = ['待投运', '运行中', '检修中', '已退役']
const voltageLevels = VOLTAGE_LEVELS
const wiringModes = WIRING_MODES

const views = ref<SubstationView[]>([])
const message = ref('')
const messageOk = ref(false)
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const stats = computed(() => [
  { label: '运行中变电站', value: views.value.filter((v) => v.row.status === '运行中').length },
  { label: '检修中变电站', value: views.value.filter((v) => v.row.status === '检修中').length },
  { label: '待投运变电站', value: views.value.filter((v) => v.row.status === '待投运').length },
])
const mineCount = computed(
  () => views.value.filter((v) => v.ownerStationName === store.stationName).length,
)
const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: views.value.filter((view) => String(view.row.status) === status).length,
  })),
)

// 筛选沿用既有口径：列表检索仍走 local-service 的包含匹配，再与归属视图按 id 对齐。
const filteredViews = computed(() => {
  const matchedIds = new Set(listEntries(meta.key, filters.value).items.map((row) => Number(row.id)))
  return views.value.filter((view) => matchedIds.has(Number(view.row.id)))
})

function permsOf(view: SubstationView) {
  return stationPerms(view, store.operator)
}

function flash(text: string, ok = false) {
  message.value = text
  messageOk.value = ok
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function resetAll() {
  resetSubstationDomain()
  closeDrawer()
  reload()
  flash('已重置为示例数据（台账、归属流水、退役工作票一并复位）', true)
}

function runAction(action: string, view: SubstationView) {
  const result = applyAction(meta.key, Number(view.row.id), action)
  flash(result.message, result.ok)
  reload()
}

function reload() {
  views.value = listStationViews()
  if (drawerId.value !== null) {
    const fresh = views.value.find((view) => Number(view.row.id) === drawerId.value)
    if (fresh) {
      drawerView.value = fresh
    } else {
      closeDrawer()
    }
  }
}

onMounted(reload)

// ── 详情抽屉 ────────────────────────────────────────────────────────────

const drawerId = ref<number | null>(null)
const drawerView = ref<SubstationView | null>(null)
const timeline = ref<SubstationLedgerEntry[]>([])

const drawerPerms = computed(() =>
  drawerView.value ? stationPerms(drawerView.value, store.operator) : { canManage: false, retired: false, editBlockedReason: '', actionBlockedReason: '' },
)

function openDrawer(view: SubstationView) {
  drawerId.value = Number(view.row.id)
  drawerView.value = view
  timeline.value = stationTimeline(drawerId.value)
  Object.assign(changeForm, {
    站名: String(view.row['站名'] ?? ''),
    电压等级: String(view.row['电压等级'] ?? ''),
    接线方式: String(view.row['接线方式'] ?? ''),
    reason: '',
  })
  transferForm.target = ''
  transferForm.reason = ''
  retireForm.reason = ''
}

function closeDrawer() {
  drawerId.value = null
  drawerView.value = null
  timeline.value = []
}

const drawerTodos = computed(() =>
  timeline.value.filter((entry) => entry.status === '办理中' && (entry.type === 'field-change' || entry.type === 'retirement')),
)

const otherStations = POWER_STATIONS.map((s) => s.name).filter(
  (name) => name !== (drawerView.value?.ownerStationName ?? ''),
)

function typeLabel(type: SubstationLedgerEntry['type']): string {
  return { 'field-change': '改动', transfer: '归属移交', retirement: '退役', handover: '交接班', action: '状态流转', note: '越权记录' }[type]
}

function statusClass(status: string): string {
  return { 办理中: 'st-doing', 已办结: 'st-done', 已退回: 'st-reject', '—': 'st-none' }[status] ?? 'st-none'
}

// ── 收权改动 ────────────────────────────────────────────────────────────

const changeForm = reactive<Record<string, string>>({ 站名: '', 电压等级: '', 接线方式: '', reason: '' })

function submitChange() {
  if (!drawerView.value) return
  const result = submitFieldChange(
    Number(drawerView.value.row.id),
    store.operator,
    { 站名: changeForm['站名'], 电压等级: changeForm['电压等级'], 接线方式: changeForm['接线方式'] },
    changeForm.reason,
  )
  flash(result.message, result.ok)
  reload()
  timeline.value = stationTimeline(drawerId.value!)
}

// ── 移交 ────────────────────────────────────────────────────────────────

const transferForm = reactive<{ target: string; reason: string }>({ target: '', reason: '' })

function submitTransfer() {
  if (!drawerView.value) return
  const result = transferStation(
    Number(drawerView.value.row.id),
    store.operator,
    transferForm.target,
    transferForm.reason,
  )
  flash(result.message, result.ok)
  reload()
  if (drawerId.value !== null) timeline.value = stationTimeline(drawerId.value)
}

// ── 退役 ────────────────────────────────────────────────────────────────

const retireForm = reactive({ reason: '' })

function submitRetire() {
  if (!drawerView.value) return
  const result = submitRetirement(Number(drawerView.value.row.id), store.operator, retireForm.reason)
  flash(result.message, result.ok)
  reload()
  if (drawerId.value !== null) timeline.value = stationTimeline(drawerId.value)
}

function completeTodo(todo: SubstationLedgerEntry) {
  const result =
    todo.type === 'retirement'
      ? completeRetirement(todo.id, store.operator)
      : completeFieldChange(todo.id, store.operator)
  flash(result.message, result.ok)
  reload()
  if (drawerId.value !== null) timeline.value = stationTimeline(drawerId.value)
}

// ── 退回 ────────────────────────────────────────────────────────────────

const rejectTarget = ref<SubstationLedgerEntry | null>(null)
const rejectReasonText = ref('')

function openReject(todo: SubstationLedgerEntry) {
  rejectTarget.value = todo
  rejectReasonText.value = ''
}

function confirmReject() {
  if (!rejectTarget.value) return
  const target = rejectTarget.value
  const result =
    target.type === 'retirement'
      ? rejectRetirement(target.id, store.operator, rejectReasonText.value)
      : rejectFieldChange(target.id, store.operator, rejectReasonText.value)
  rejectTarget.value = null
  flash(result.message, result.ok)
  reload()
  if (drawerId.value !== null) timeline.value = stationTimeline(drawerId.value)
}

// ── 交接班 ──────────────────────────────────────────────────────────────

const handoverOpen = ref(false)
const handoverTargetId = ref('')
const myPending = ref<SubstationLedgerEntry[]>([])

const sameStationOperators = computed(() =>
  stationOperators(store.operator.stationId).filter((op) => op.id !== store.operatorId),
)

function openHandover() {
  myPending.value = pendingHandledBy(store.operator)
  handoverTargetId.value = ''
  handoverOpen.value = true
}

function confirmHandover() {
  const targetId = handoverTargetId.value
  if (!targetId) return
  const to = stationOperators(store.operator.stationId).find((op) => op.id === targetId)
  if (!to) return
  const result = handoverShift(store.operator, to)
  if (!result.ok) {
    flash(result.message, false)
    return
  }
  store.setOperator(to.id)
  handoverOpen.value = false
  flash(result.message, true)
  reload()
}
</script>

<style scoped>
.station-link { font-size: 13px; }
.is-retired { background: #f1f5f9; color: #64748b; }
.is-other { background: #fbfdff; }
.owner-tag { color: #b45309; font-size: 12px; }
.pending-tag { color: #92400e; background: #fef3c7; border-radius: 999px; padding: 2px 8px; font-size: 12px; white-space: nowrap; }
.readonly-tag { color: #64748b; font-size: 12px; }
.mine { background: #e0ecff; color: #1d4ed8; }
.ok-text { color: #15803d; }
.muted { color: #64748b; font-size: 12px; }

.drawer-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; justify-content: flex-end; z-index: 50; }
.drawer { width: 560px; max-width: 92vw; background: #fff; height: 100%; overflow-y: auto; padding: 18px 20px; box-shadow: -8px 0 24px rgba(15, 23, 42, 0.18); }
.drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
.drawer-head h3 { margin: 0 0 4px; font-size: 17px; }
.drawer-sub { margin: 0; font-size: 12px; color: var(--muted); }
.drawer-block { margin-top: 16px; }
.drawer-block h4 { margin: 0 0 8px; font-size: 14px; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin: 0; }
.field-grid dt { color: var(--muted); font-size: 12px; }
.field-grid dd { margin: 2px 0 0; font-size: 13px; }
.banner { border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-top: 12px; }
.banner.warn { background: #fef2f2; border: 1px solid #fecaca; color: #b42318; }
.banner.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.edit-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.edit-form.inline { align-items: flex-end; }
.reason-item { flex: 1 1 220px; }
.edit-form .filter-item input, .edit-form .filter-item select, .modal select, .modal textarea {
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 13px; min-width: 150px; width: 100%;
}
.block-tip { font-size: 12px; color: #92400e; background: #fef3c7; border-radius: 6px; padding: 6px 8px; }
.todo-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.todo-card header { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; flex-wrap: wrap; }
.todo-reason { margin: 6px 0; font-size: 13px; }
.todo-actions { display: flex; gap: 8px; margin-top: 8px; }
.change-list { margin: 4px 0; padding-left: 18px; font-size: 13px; }
.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li { border-left: 3px solid var(--border); padding: 0 0 12px 12px; margin-left: 4px; }
.timeline-head { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.timeline-type { font-weight: 600; }
.timeline-status { border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.st-doing { background: #fef3c7; color: #92400e; }
.st-done { background: #dcfce7; color: #15803d; }
.st-reject { background: #fee2e2; color: #b42318; }
.st-none { background: #e2e8f0; color: #475569; }
.timeline-body { font-size: 13px; margin: 3px 0; }
.timeline-foot { font-size: 12px; }

.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 460px; max-width: 92vw; margin: auto; align-self: center; }
.modal h3 { margin: 0 0 8px; font-size: 16px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.modal .filter-item { margin-bottom: 10px; }
.modal .filter-item span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
</style>
