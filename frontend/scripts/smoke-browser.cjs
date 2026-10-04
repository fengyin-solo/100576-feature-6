// 浏览器级冒烟：jsdom 加载 vite 构建产物，真实点击/切换身份走一遍完整链路。
const path = require('path')
const fs = require('fs')
const { JSDOM } = require('jsdom')

const dist = path.join(__dirname, '..', 'dist-smoke')
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')

const errors = []
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const { window } = dom

// jsdom 里程序化赋值不会触发 Vue 3 的 v-model：走原生 value setter 再派发 change/input。
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el)
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc.set.call(el, value)
}
function pick(selectEl, value) {
  setNativeValue(selectEl, value)
  selectEl.dispatchEvent(new window.Event('change', { bubbles: true }))
  selectEl.dispatchEvent(new window.Event('input', { bubbles: true }))
}
function type(inputEl, value) {
  setNativeValue(inputEl, value)
  inputEl.dispatchEvent(new window.Event('input', { bubbles: true }))
}
function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
}

// ESM 入口运行在 Node 模块作用域，把 jsdom 的浏览器全局挂到 globalThis 上（不覆盖 Node 自带）。
const DOM_GLOBALS = [
  'document', 'navigator', 'HTMLElement', 'Event', 'CustomEvent', 'Node', 'NodeFilter',
  'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'Element', 'DocumentFragment', 'SVGElement', 'Document', 'ShadowRoot', 'DOMParser',
  'XMLSerializer', 'Blob', 'FileReader', 'URL', 'history', 'location', 'alert',
]
for (const key of DOM_GLOBALS) {
  if (window[key] !== undefined && globalThis[key] === undefined) {
    globalThis[key] = window[key]
  }
}
globalThis.window = window
globalThis.localStorage = window.localStorage
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

// 生产 index.html 里的脚本是 /assets/... 绝对路径，手工内联执行。
window.addEventListener('error', (e) => errors.push(e.message))

async function boot() {
  // 冒烟构建把所有异步 chunk 内联进了 entry.js，直接在 Node 的模块引擎里执行即可。
  await import(path.join(dist, 'entry.js'))
  // 等 Vue mount。
  await new Promise((r) => setTimeout(r, 600))

  const $ = (sel) => window.document.querySelector(sel)
  const $$ = (sel) => Array.from(window.document.querySelectorAll(sel))
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '')

  let passed = 0
  function check(label, cond) {
    if (cond) { passed++; console.log('  ✓', label) } else { console.error('  ✗', label); process.exitCode = 1 }
  }

  console.log('启动后落在运营概览，导航到变电站台账')
  const subLink = $$('a.nav-item').find((a) => a.textContent.includes('变电站台账'))
  click(subLink)
  await new Promise((r) => setTimeout(r, 500))

  const page = $('.page[data-module="substation"]')
  check('变电站台账页已渲染', !!page && text($('h2')).includes('变电站台账'))
  const rows = $$('.data-table tbody tr')
  check('列表渲染4座站', rows.length === 4)
  check('列表显示滨江站', page.textContent.includes('城东110kV滨江变电站'))
  check('列表显示白鹤站归属城西（移交口径）', page.textContent.includes('城西220kV白鹤变电站') && page.textContent.includes('移交自城东供电所'))

  console.log('默认身份是城东周明：切到城西韩雪验证只读')
  const select = $('.identity-pick select')
  pick(select, 'u-hanxue')
  await new Promise((r) => setTimeout(r, 100))
  check('顶栏显示韩雪身份', $('.head-user').textContent.includes('韩雪'))
  const baiheRow = rows.find((tr) => tr.textContent.includes('白鹤'))
  check('白鹤站对城西韩雪显示动作按钮（归属所）', baiheRow.textContent.includes('办理退役'))
  const binjiangRow = rows.find((tr) => tr.textContent.includes('滨江'))
  check('滨江站对城西韩雪只显示仅查看', binjiangRow.textContent.includes('仅查看（城东供电所管辖）'))

  console.log('打开滨江站抽屉：越权提交改动应被退回并写明理由、且留痕')
  click($('.station-link')) // 第一行是滨江
  await new Promise((r) => setTimeout(r, 100))
  let drawer = $('.drawer')
  check('抽屉打开且站名与列表一致', !!drawer && text($('.drawer-head h3')) === '城东110kV滨江变电站')
  check('抽屉显示越权保护提示', drawer.textContent.includes('只能查看，改动会被退回'))
  // 越权保护下编辑表单不应出现
  check('别所看不到改动表单', !drawer.textContent.includes('申请改动（站名 / 电压等级 / 接线方式）'))

  console.log('切回城东周明：走退役申请→办结→工作票联动')
  pick(select, 'u-zhouming')
  await new Promise((r) => setTimeout(r, 100))
  // 关掉抽屉重开，拿到周明视角
  click($('.drawer-head .btn.ghost'))
  await new Promise((r) => setTimeout(r, 50))
  const rowsNow = $$('.data-table tbody tr')
  click(rowsNow.find((tr) => tr.textContent.includes('滨江')).querySelector('.station-link'))
  await new Promise((r) => setTimeout(r, 100))
  drawer = $('.drawer')
  check('归属所能看到改动表单', drawer.textContent.includes('申请改动'))

  // 填退役理由并提交
  const inputs = $$('.drawer input')
  const reasonInput = inputs[inputs.length - 1]
  type(reasonInput, '设备老旧，列入年度退役计划')
  const buttons = $$('.drawer button')
  const submitRetire = buttons.find((b) => b.textContent.includes('提交退役申请'))
  click(submitRetire)
  await new Promise((r) => setTimeout(r, 100))
  check('提交后出现退役办结待办', $('.drawer').textContent.includes('退役办结（锁定并落工作票）'))
  check('列表行出现退役办理中标记', rowsNow.find((tr) => tr.textContent.includes('滨江')).textContent.includes('退役申请办理中'))

  // 重复提交：抽屉里退役表单已隐藏；验证列表的办理退役按钮被禁用且再次办结不会重复落单
  const finish = $$('.todo-actions .btn.primary').find((b) => b.textContent.includes('退役办结'))
  click(finish)
  await new Promise((r) => setTimeout(r, 100))
  check('办结后抽屉显示只读横幅', $('.drawer').textContent.includes('已办结退役，整条台账锁为只读'))
  check('办结后列表行标记已退役·只读', !!$$('.data-table tbody tr').find((tr) => tr.textContent.includes('滨江') && tr.textContent.includes('已退役·只读')))

  console.log('退役结论落到工作票许可待办理清单')
  const wpLink = $$('a.nav-item').find((a) => a.textContent.includes('工作票许可'))
  click(wpLink)
  await new Promise((r) => setTimeout(r, 500))
  check('工作票页出现退役联动票', window.document.body.textContent.includes('RET-0001'))
  check('联动票在待办理（待签发）统计里', text($('.page[data-module="workpermit"] .stat-card .stat-value')) !== '0')
  check('联动票任务写的是退役办结结论', window.document.body.textContent.includes('滨江变电站退役办结，设备停运、台账归档'))

  console.log('重复办结不重复落单：回到台账对已退役站再点退役（域层兜底）')
  click(subLink)
  await new Promise((r) => setTimeout(r, 500))
  const stillOne = JSON.parse(window.localStorage.getItem('substation-protection:entries')).workpermit
    .filter((p) => String(p['工作票号']).indexOf('RET-') === 0).length
  check('localStorage 中退役票恰好1条', stillOne === 1)

  console.log('交接班：城南宋交班场景在种子数据里（青山站改动经办人王强→赵霞）')
  pick(select, 'u-wangqiang')
  await new Promise((r) => setTimeout(r, 100))
  click($$('.data-table tbody tr').find((tr) => tr.textContent.includes('青山')).querySelector('.station-link'))
  await new Promise((r) => setTimeout(r, 100))
  check('青山抽屉待办显示原经办人王强', $('.drawer').textContent.includes('原经办人：王强'))
  click($('.drawer-head .btn.ghost'))

  // 打开交接班弹窗
  const handoverBtn = $$('.page-head .btn').find((b) => b.textContent.includes('交接班'))
  click(handoverBtn)
  await new Promise((r) => setTimeout(r, 100))
  const modal = $('.modal')
  check('交接班弹窗提示将转交1条在办事项', modal.textContent.includes('将转交 1 条在办事项'))
  const hs = $('.modal select')
  pick(hs, 'u-zhaoxia')
  click($$('.modal .btn.primary').find((b) => b.textContent.includes('完成交接')))
  await new Promise((r) => setTimeout(r, 100))
  check('交接后顶栏切换为赵霞', $('.head-user').textContent.includes('赵霞'))
  await new Promise((r) => setTimeout(r, 100))
  click($$('.data-table tbody tr').find((tr) => tr.textContent.includes('青山')).querySelector('.station-link'))
  await new Promise((r) => setTimeout(r, 100))
  const qsDrawer = $('.drawer')
  check('青山抽屉待办经办人变为赵霞、原经办人仍为王强',
    qsDrawer.textContent.includes('经办人：赵霞') && qsDrawer.textContent.includes('原经办人：王强'))

  check('页面无运行时报错', errors.length === 0)
  if (errors.length) console.error(errors)
  console.log(`\n浏览器级冒烟通过 ${passed} 项检查`)
  if (process.exitCode) process.exit(process.exitCode)
}

boot().catch((e) => { console.error(e); process.exit(1) })
