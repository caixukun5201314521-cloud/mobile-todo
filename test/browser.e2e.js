import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';
import { localDate, localInput } from '../public/utils.js';

const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-e2e-'));
const service = await startServer({ port: 0, host: '127.0.0.1', dataPath, apiKey: '' });
const base = `http://127.0.0.1:${service.server.address().port}`;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const dialog = page.locator('#appDialog');
const form = dialog.locator('form');
const records = async () => (await fetch(`${base}/api/state`)).json();
const action = async (name, parent = page) => parent.locator(`[data-action="${name}"]`).first().click();
const fill = async (name, value) => form.locator(`[name="${name}"]`).fill(String(value));
const choose = async (name, value) => form.locator(`[name="${name}"]`).selectOption(value);
const save = async () => {
  await form.locator('[type=submit]').click();
  try { await page.waitForFunction(() => !document.querySelector('#appDialog').open, { timeout: 5000 }); }
  catch { throw new Error(`Form did not close: ${await page.locator('#formError').textContent()}`); }
};
const goto = async hash => { await page.goto(`${base}/#${hash}`); await page.locator('#syncStatus.online').waitFor(); };
const stamp = await page.evaluate(() => {
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { start: local(new Date(Date.now()-120*60000)), end: local(new Date(Date.now()-60*60000)) };
});
async function setTime(minutes=45) { await fill('startAt',stamp.start); await fill('endAt',stamp.end); await fill('durationMinutes',minutes); }
const results = [];
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }

try {
  await check('任务新增、时间必填、核销、撤销保留历史、再次完成', async () => {
    await goto('tasks'); await action('new-task'); await fill('title','学习 pandas 数据清洗'); await choose('module','learning'); await fill('subject','Python'); await fill('estimatedMinutes',60); await save();
    assert.equal((await records()).todos.length,1);
    await action('complete-task');
    await form.locator('[type=submit]').click();
    assert.equal((await records()).todos[0].completed,false);
    assert.equal(await dialog.getAttribute('open'),'');
    await setTime(40); await fill('notes','完成缺失值处理与合并练习'); await save();
    let state=await records(); assert.equal(state.todos[0].completed,true); assert.equal(state.todos[0].timeEntries[0].durationMinutes,40);
    await page.locator('[data-filter="completed"]').click(); await action('reopen-task');
    await page.waitForTimeout(200); state=await records(); assert.equal(state.todos[0].completed,false); assert.equal(state.todos[0].timeEntries.length,1);
    await page.locator('[data-filter="pending"]').click(); await action('complete-task'); await setTime(10); await save();
    assert.equal((await records()).todos[0].timeEntries.length,2);
  });
  await check('课外拓展日志可保存、编辑、按主题筛选', async () => {
    await goto('learning'); await action('new-study'); await fill('subject','IELTS'); await fill('topic','Listening Section 3'); await fill('resource','剑桥雅思练习'); await setTime(35); await choose('energy','7'); await fill('notes','错题与同义替换'); await save();
    assert.equal((await records()).studySessions[0].durationMinutes,35);
    await page.locator('[data-subject="IELTS"]').click(); await action('edit-study'); await fill('durationMinutes',30); await save();
    assert.equal((await records()).studySessions[0].durationMinutes,30);
  });
  await check('有氧与力量训练明细保存、编辑并导出原始单位', async () => {
    await goto('training'); await action('new-workout'); await fill('title','下肢力量与轻松跑'); await choose('type','mixed'); await fill('location','学校健身房'); await fill('intensity',6); await setTime(50);
    const first=form.locator('.exercise-row').first();await first.locator('[name=exerciseName]').fill('深蹲'); await first.locator('[name=exerciseSets]').fill('3'); await first.locator('[name=exerciseReps]').fill('10'); await first.locator('[name=exerciseWeight]').fill('40');
    await action('add-exercise',dialog); const second=form.locator('.exercise-row').last();await second.locator('[name=exerciseName]').fill('慢跑');await second.locator('[name=exerciseDuration]').fill('20');await second.locator('[name=exerciseDistance]').fill('3');await save();
    const state=await records(); assert.equal(state.workouts[0].exercises.length,2);assert.equal(state.workouts[0].exercises[0].weightKg,40);assert.equal(state.workouts[0].exercises[1].distanceKm,3);
    await action('edit-workout'); await fill('location','校内健身房 A 区'); await save(); assert.equal((await records()).workouts[0].location,'校内健身房 A 区');
  });
  await check('论文笔记与分次阅读、完成时段保留', async () => {
    await goto('papers');await action('new-paper');await fill('title','测试论文：教育与收入');await fill('authors','Test Author');await fill('year','2020');await fill('url','https://example.org/paper');await fill('question','教育如何影响收入？');await fill('method','工具变量');await save();
    await action('paper-session');await setTime(20);await save();
    await action('paper-detail');await action('complete-paper',dialog);await setTime(30);await save();
    let paper=(await records()).papers[0];assert.equal(paper.status,'completed');assert.equal(paper.timeEntries.length,2);
    await action('paper-detail');await action('edit-paper',dialog);await fill('findings','完善识别假设的理解');await save();paper=(await records()).papers[0];assert.equal(paper.status,'completed');assert.equal(paper.timeEntries.length,2);
  });
  await check('财务：4000基准、额外收入、消费与投资互不混算', async () => {
    await goto('finance');
    for(const t of [{type:'expense',amount:'25.10',category:'健康饮食'},{type:'income',amount:'800',category:'雅思助教'},{type:'investment',amount:'500',category:'ETF定投'}]) {
      await action('new-transaction'); await choose('type',t.type);await fill('amount',t.amount);await fill('category',t.category);await save();
    }
    const data=await records();assert.equal(data.transactions.length,3);
    assert.match(await page.locator('.balance-amount').textContent(),/4,274\.90/);
    await action('budget');await fill('monthlyBudget',4200);await save();assert.match(await page.locator('.balance-amount').textContent(),/4,474\.90/);
  });
  await check('JSON / CSV / Markdown 均触发真实文件下载', async () => {
    await goto('export');
    for(const format of ['json','csv','markdown']) {
      const pending=page.waitForEvent('download');await action(`download-${format}`);const download=await pending;const file=await download.path();assert.ok(fs.statSync(file).size>20);assert.equal(await download.failure(),null);
      if(format==='json') { const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.ok(data.schemaVersion);assert.ok(data.dataDictionary); }
      if(format==='csv') assert.ok(fs.readFileSync(file,'utf8').includes('学习 pandas 数据清洗'));
    }
  });
  await check('无脚本注入，完整任务内容以文字呈现', async () => {
    await goto('tasks');await action('new-task');await fill('title','<img src=x onerror=alert(1)>');await fill('content','<script>alert(1)</script>');await save();
    assert.equal(await page.locator('main img').count(),0);assert.ok((await page.locator('main').textContent()).includes('<img src=x onerror=alert(1)>'));
  });
  await check('桌面 / 手机全页面无横向溢出，深浅色均可使用', async () => {
    for(const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:900});
      for(const route of ['overview','tasks','deadlines','training','learning','papers','finance','export']) {
        await goto(route);
        const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth,width:window.innerWidth}));
        assert.ok(overflow.body<=overflow.width+1,`${route} overflow at ${width}: ${JSON.stringify(overflow)}`);
      }
    }
    await page.setViewportSize({width:390,height:844});await goto('overview');await action('theme');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await action('theme');
    await action('more');assert.equal(await dialog.locator('.more-item').count(),8);await dialog.locator('a[href="#papers"]').click();assert.ok(page.url().endsWith('#papers'));
    await action('new-paper');const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391);await action('close-dialog',dialog);
  });
  await check('刷新后记录保留，删除需要确认', async()=>{
    await goto('training');await action('delete-record');await action('close-dialog',dialog);assert.equal((await records()).workouts.length,1);await action('delete-record');await save();assert.equal((await records()).workouts.length,0);
    await page.reload();await page.locator('#syncStatus.online').waitFor();assert.equal((await records()).transactions.length,3);
  });
  await check('浏览器没有未捕获脚本错误',async()=>assert.deepEqual(errors,[]));
  if(process.env.DAYMARK_SCREENSHOTS) {
    fs.mkdirSync(process.env.DAYMARK_SCREENSHOTS,{recursive:true});
    await page.setViewportSize({width:1440,height:1100});await goto('overview');await page.screenshot({path:path.join(process.env.DAYMARK_SCREENSHOTS,'daymark-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await goto('overview');await page.screenshot({path:path.join(process.env.DAYMARK_SCREENSHOTS,'daymark-mobile.png'),fullPage:true});
  }
  console.log(`\n${results.length} browser scenarios passed; all data was isolated in ${dataPath}`);
} finally {
  await browser.close(); await service.close(); fs.rmSync(dataPath,{recursive:true,force:true});
}
