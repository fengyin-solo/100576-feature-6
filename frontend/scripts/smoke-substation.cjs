// 域逻辑冒烟脚本：用内存版 localStorage 桩跑通收权、移交、退役与交接班规则。
// 通过 typescript.transpileModule 即时转译 .ts（含 @/ 别名），无需原生 esbuild。
const path = require('path')
const fs = require('fs')
const Module = require('module')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src')
require.extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      sourceMap: false,
    },
    fileName: filename,
  })
  mod._compile(output.outputText, filename)
}
const oldResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    request = path.join(SRC, request.slice(2))
  }
  return oldResolve.call(this, request, ...rest)
}

const mem = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
  },
}

const domain = require('../src/api/substation-domain.ts')

let passed = 0
function check(label, cond) {
  if (cond) {
    passed++
    console.log('  ✓', label)
  } else {
    console.error('  ✗', label)
    process.exitCode = 1
  }
}

const zhou = { id: 'u-zhouming', name: '周明', stationId: 'chengdong', stationName: '城东供电所' }
const han = { id: 'u-hanxue', name: '韩雪', stationId: 'chengxi', stationName: '城西供电所' }
const wang = { id: 'u-wangqiang', name: '王强', stationId: 'chengnan', stationName: '城南供电所' }
const zhao = { id: 'u-zhaoxia', name: '赵霞', stationId: 'chengnan', stationName: '城南供电所' }
const chen = { id: 'u-chenhao', name: '陈昊', stationId: 'chengbei', stationName: '城北供电所' }

console.log('1) 归属口径：白鹤站台账写城东，最近移交记录为城西')
const views = domain.listStationViews()
const baihe = views.find((v) => v.row.id === 2)
check('白鹤站归属解析为城西供电所', baihe.ownerStationName === '城西供电所')
check('识别到台账口径与移交冲突', baihe.ownerConflict === true)
const binjiang = views.find((v) => v.row.id === 1)
check('无移交记录的滨江站沿用台账口径城东', binjiang.ownerStationName === '城东供电所')

console.log('2) 收权：城西韩雪不能改城东滨江站，退回且留痕、带理由')
let r = domain.submitFieldChange(1, han, { 站名: '乱改一个名' }, '试试')
check('越权改动被退回 ok=false', r.ok === false)
check('退回理由点明归属所', r.message.includes('城东供电所') && r.message.includes('只能查看'))
check('越权提交在流水里留痕', domain.stationTimeline(1).some((e) => e.type === 'note' && e.status === '已退回' && e.createdBy === 'u-hanxue'))

console.log('3) 归属所周明可以改滨江站，在办期间不写台账；办结后生效')
r = domain.submitFieldChange(1, zhou, { 站名: '城东110kV滨江变电站', 电压等级: '220kV' }, '升压改造')
check('同所改动受理', r.ok === true)
check('在办改动期间电压等级仍为110kV', domain.listStationViews().find((v) => v.row.id === 1).row['电压等级'] === '110kV')
const change = domain.stationTimeline(1).find((e) => e.type === 'field-change' && e.status === '办理中')
check('生成办理中的改动流水', !!change)
r = domain.completeFieldChange(change.id, han)
check('别所不能办结改动', r.ok === false && r.message.includes('越权'))
r = domain.completeFieldChange(change.id, zhou)
check('归属所办结成功', r.ok === true)
check('办结后电压等级变为220kV', domain.listStationViews().find((v) => v.row.id === 1).row['电压等级'] === '220kV')
check('列表与抽屉同源：站名两处一致', domain.stationViewById(1).row['站名'] === '城东110kV滨江变电站')

console.log('4) 交接跟随：青山站在办改动经办人王强，交接给同所赵霞；原经办人保留')
r = domain.handoverShift(wang, chen)
check('跨所交接班被拒', r.ok === false && r.message.includes('内部进行'))
r = domain.handoverShift(wang, zhao)
check('同所交接班成功', r.ok === true)
const qingshanChange = domain.stationTimeline(3).find((e) => e.type === 'field-change' && e.status === '办理中')
check('在办改动经办人变为赵霞', qingshanChange.handlerId === 'u-zhaoxia' && qingshanChange.handlerName === '赵霞')
check('原经办人仍是王强', qingshanChange.createdBy === 'u-wangqiang' && qingshanChange.createdByName === '王强')
check('留下交接班流水', domain.stationTimeline(3).some((e) => e.type === 'handover'))
check('赵霞能看到这条待办', domain.pendingHandledBy(zhao).some((e) => e.id === qingshanChange.id))
check('王强不再持有该待办', !domain.pendingHandledBy(wang).some((e) => e.id === qingshanChange.id))
r = domain.completeFieldChange(qingshanChange.id, zhao)
check('接班人可办结，台账生效', r.ok === true && domain.stationViewById(3).row['接线方式'] === '单母线接线')

console.log('5) 退役：重复提交只落一条；办结锁只读；结论落工作票待办理清单')
r = domain.submitRetirement(4, han)
check('别所提交退役被退回', r.ok === false)
r = domain.submitRetirement(4, chen, '设备老化')
check('归属所提交退役受理', r.ok === true)
r = domain.submitRetirement(4, chen, '再提交一次')
check('同一座站重复退役提交不再落新记录', r.ok === false && r.message.includes('重复提交'))
const ret = domain.stationTimeline(4).find((e) => e.type === 'retirement' && e.status === '办理中')
check('退役申请只有一条', domain.stationTimeline(4).filter((e) => e.type === 'retirement').length === 1)
r = domain.completeRetirement(ret.id, han)
check('别所不能办结退役', r.ok === false)
r = domain.completeRetirement(ret.id, chen)
check('归属所办结退役成功', r.ok === true)
check('站状态变为已退役', domain.stationViewById(4).row.status === '已退役')
const permsAfter = domain.stationPerms(domain.stationViewById(4), chen)
check('退役后整站只读（归属所也不能改）', permsAfter.canManage === false && permsAfter.retired === true)
r = domain.submitFieldChange(4, chen, { 接线方式: '双母线接线' }, '退役后还想改')
check('退役后改动被退回', r.ok === false && r.message.includes('只读'))
r = domain.runStationStatusAction(4, '安排检修', '检修中', chen)
check('退役后流转动作也被锁', r.ok === false && r.message.includes('只读'))

console.log('6) 退役结论落到工作票许可待办理清单，且重复办结不重复落单')
const linked = JSON.parse(mem.get('substation-protection:entries')).workpermit.filter((p) =>
  String(p['工作票号']).startsWith('RET-'),
)
check('工作票清单里恰好一条退役票', linked.length === 1)
check('退役票状态为待签发（待办理）', linked[0].status === '待签发')
check('退役票关联云湖站', linked[0]['所属变电站'] === '城北110kV云湖变电站')
check('退役票工作负责人记的是办结人陈昊', linked[0]['工作负责人'] === '陈昊')
r = domain.completeRetirement(ret.id, chen)
check('重复办结退役被拒', r.ok === false)
const linkedAgain = JSON.parse(mem.get('substation-protection:entries')).workpermit.filter((p) =>
  String(p['工作票号']).startsWith('RET-'),
)
check('重复办结没有再落工作票', linkedAgain.length === 1)

console.log('7) 移交即时生效，且在办事项随归属转给接收所')
r = domain.transferStation(1, han, '城西供电所', '试试别人的站')
check('非归属所发起移交被拒', r.ok === false)
r = domain.submitFieldChange(1, zhou, { 站名: '城东110kV滨江变电站(拟移交)' }, '移交前的改动')
check('滨江站再提一条改动', r.ok === true)
const moveChange = domain.stationTimeline(1).find((e) => e.type === 'field-change' && e.status === '办理中')
r = domain.transferStation(1, zhou, '城西供电所', '片区调整')
check('城东把滨江站移交城西成功', r.ok === true)
const after = domain.stationViewById(1)
check('移交后归属立即变为城西', after.ownerStationName === '城西供电所')
const movedChange = domain.stationTimeline(1).find((e) => e.id === moveChange.id)
check('在办改动经办人转给城西默认值班人韩雪', movedChange.handlerId === 'u-hanxue')
check('原经办人周明保留在历史', moveChange.createdBy === 'u-zhouming')
check('移交后城东被视为别的所、只能查看', domain.stationPerms(after, zhou).canManage === false)
check('移交后城西可以办理', domain.stationPerms(after, han).canManage === true)
r = domain.submitFieldChange(1, zhou, { 站名: 'x' }, '移交后城东再改')
check('移交后城东改动被退回并说明新归属', r.ok === false && r.message.includes('城西供电所'))

console.log(`\n通过 ${passed} 项检查`)
if (process.exitCode) process.exit(process.exitCode)
