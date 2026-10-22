# Daymark · 每一天，都算数

一个围绕「计划 → 实际执行记录 → 原始数据导出」设计的个人空间。包括任务清单、截止倒计时、训练日志、课外拓展、论文阅读、财务与数据导出。浅灰白、蓝色强调、大留白和响应式卡片；桌面侧栏、手机底部导航，支持深色主题与键盘操作。

**网站负责记录和整理，不负责生成健康、投资或学习建议。** 你可以下载数据交给自己选择的 agent，分析后再创建或调整任务。不会自动上传记录给第三方 AI。

## 启动

项目目录：`/Users/elthan/Documents/mobile-todo`

有 Node.js 的环境，保留原来的启动方式：

```bash
cd /Users/elthan/Documents/mobile-todo
npm install
npm start
```

也可以使用 Bun（本次开发和验证使用 Bun）：

```bash
cd /Users/elthan/Documents/mobile-todo
bun install
bun run start:bun
```

- 电脑：`http://localhost:3000`
- 手机：与电脑同一 Wi-Fi，打开 `http://<电脑局域网IP>:3000`。顶部「连接手机」可查看地址和二维码。
- 如果二维码地址为 `localhost`，手机应使用弹窗里的局域网地址。
- 启动的是本地服务器，需要电脑运行且手机能访问它。不是云托管服务，暂不支持离线写入。
- 原生 JavaScript 模块，无前端构建步骤。不建议双击 `public/index.html`，它需要同源 API。

可选环境变量：

```bash
PORT=3000 HOST=0.0.0.0 DATA_PATH=./data bun server.js
API_KEY='替换为自己的随机密钥' bun server.js
```

`DATA_PATH` 可以是数据目录或任务 JSON 文件。`API_KEY` 不为空时，除网络地址接口之外的所有数据读取、写入、导出和实时事件都需要认证。网页首次进入会提示输入；密钥仅保存在当前标签会话。API 使用 `x-api-key` 请求头，SSE 支持 `?key=`。未设置密钥时，能连接服务器的人也能读取与修改记录，适合受信任网络。公网上部署应使用 HTTPS、密钥和持久化数据卷。

## 八个页面

| 页面 | 用法 |
| --- | --- |
| 总览 | 今日计划圆环、实际投入、本周训练、月度可用资金、周历与临近截止事项 |
| 任务清单 | 添加、编辑、搜索、按板块与完成状态筛选、核销与恢复待办；保留任务内容、链接和图片 |
| 截止倒计时 | 独立显示剩余时间、逾期状态；未填时间按计划日当地 23:59 截止 |
| 训练日志 | 有氧 / 力量 / 综合训练，实际起止时间、有效时长、地点、强度、动作、组数、次数、负重、距离和笔记 |
| 课外拓展 | Python、Stata、LaTeX、MATLAB、经济学、统计学、计量经济学、IELTS 和自定义方向；记录主题、材料、时间和问题 |
| 论文阅读 | 待读 / 阅读中 / 已读完，作者、年份、领域、链接、研究问题、识别策略、发现和笔记；支持分次阅读记录 |
| 财务管理 | 月度资金基准、额外收入、生活支出、必要性、支付账户与 ETF 投入；按月查看、编辑和删除流水 |
| 数据导出 | 按日期导出 JSON 完整包、CSV 数据集、Markdown 说明与记录 |

手机底栏「更多」包含全部页面和个人设置。单车定位保留在「我的个人空间」/「个人设置与单车」中，可记录 GPS、位置描述和照片、打开地图、确认取车。非 HTTPS 局域网的定位可能受浏览器限制，支持手动填坐标。

### 时间记录与统计口径

- **所有任务核销和论文完成都必须提供起止时间及实际分钟数。** 不能只改成已完成。
- 结束必须晚于开始，不允许在未来；实际分钟数大于 0，且不能超过时间段长度，可以扣掉休息时间。支持跨午夜。
- 任务可以先「记录一个时段」，最后一次再核销；论文同样支持分次阅读。
- 撤销完成保留历史时段。重新完成会新增时段，不覆写过去的投入。
- 旧任务如果没有实际时段，显示「旧记录 · 未记录时段」，不补造历史数据。
- 日期/时间输入采用浏览器本地时间，保存为带时区的 ISO 时间。导出按选择的时区及开始日期分配时段，跨午夜不自动拆分。
- 课外拓展汇总包含独立学习日志和标为「课外拓展」的任务时段。同一活动请选一种方式记录，避免人工重复。
- 训练日志用于记录具体动作；训练计划任务的核销记录用于任务进度，两个记录集合不会被当成同一条记录自动合并。统计全域投入时，应依据活动内容去重。
- 首页「今日投入」汇总任务、学习、论文记录；训练日志单独计数。
- 日历计划时间与实际执行时间是两种口径：导出任务清单按计划日期筛选，导出时段按实际开始日期筛选。

### 财务口径

初始月度资金基准为你提供的 **4000 元**，可在财务页调整。分类额度不做假设，必要性由你自己标注。

```text
本月资金 = 月度基准 + 当月额外收入
本月可用资金 = 本月资金 − 当月生活支出 − 当月投资转入
```

- 月度基准只是预算口径，不会重复生成一笔收入。录入雅思助教、兼职、奖学金等额外收入即可。
- 健康饮食、基本生活等可标为必要支出，不通过压缩健康投入自动生成建议。
- ETF 定投记录为「投资转入」，从可用现金扣除，但不计入生活消费；可填写标的名称或代码。
- 金额最多两位小数，按整数分计算。不会拉取行情，不计算投资收益、持仓市值、税费或卖出盈亏。
- **当前预算不跨月结转。月度基准是全局设置，更改后适用于所有月份的预算展示；原始交易记录不会修改。** 若将来需要真实账户余额、滚存和历史预算版本，应扩展独立账户与月度预算模型。

## 数据保存与兼容

```text
data/
  todos.json    # 原有任务，保持路径和旧字段
  bike.json     # 原有单车信息
  life.json     # 新增训练、学习、论文、财务及设置（首次写入时创建）
```

已有 `todos.json`、`bike.json` 和 `public/uploads/` 内容保留。没有添加演示收入、训练、学习记录，也不会替你改变旧任务的计划时间或内容。旧「学习」类别不会被擅自标成科研，可自行编辑归属板块。

- 服务端校验后原子写入；损坏或不可读文件会返回错误，不当作空数据覆盖。
- 写入使用临时锁，避免 API/CLI 同时覆盖；繁忙或外部并发修改时返回 409。
- 目录监听支持编辑器/CLI 的原子替换，并通过 Server-Sent Events 更新网页。
- 浏览器表单发生保存错误会保留内容；页面没有静默离线保存队列。
- 删除会删除该记录及附属时段，需要确认；恢复待办不会删除时间历史。
- 数据目录是个人原始记录，请定期复制整个目录或导出 JSON。**当前没有 JSON 一键导入恢复界面。**

## 导出给 agent

推荐在「数据导出」中下载 **完整 JSON**。包内包括 schemaVersion、exportedAt、时区、日期范围、字段字典和原始记录。

| 格式 | 内容 |
| --- | --- |
| JSON | 完整结构、稳定 ID、原始细节、关联与字段说明 |
| CSV | 任务、时间记录、训练、动作明细、学习、论文、财务，可单独选择；UTF-8 BOM 与公式注入防护 |
| Markdown | 人类可读说明、记录数量和完整 JSON，便于 agent 阅读 |

范围留空导出全部。日期范围包含开始和结束当天；任务按计划日期，时间记录按实际发生日期，账本按记账日期筛选。独立时段保留所属 ID 与相关母记录。训练与动作的时长不是互斥集合，分析时不能直接相加。详见每份导出内的 `dataDictionary`。

给分析 agent 的提示词可以是：

> 请依据文件中的字段字典分析真实记录。先检查日期覆盖、缺失时长、同一活动的重复记录和训练/动作的包含关系。将计划与实际投入分开，分别总结学习、论文、训练和收支。不要把 ETF 本金投入当成生活消费或收益，不要把每月预算再次计作收入。标明数据不足和不确定性，再提出我可以确认的下一阶段任务建议；不要编造未记录的训练、健康信息或财务数据。

## API / CLI

核心接口：

```text
GET   /api/state
GET/POST/PATCH/DELETE  /api/todos[/:id]
POST  /api/todos/:id/sessions
GET/POST/PATCH/DELETE  /api/workouts[/:id]
GET/POST/PATCH/DELETE  /api/study-sessions[/:id]
GET/POST/PATCH/DELETE  /api/papers[/:id]
POST  /api/papers/:id/sessions
GET/POST/PATCH/DELETE  /api/transactions[/:id]
GET/PATCH /api/settings
GET   /api/export?format=json|csv|markdown&dataset=todos|timeEntries|workouts|exercises|studySessions|papers|transactions
GET   /api/events
GET   /api/network
GET/POST /api/bike
POST  /api/bike/clear
```

集合接口 POST 用于新增，PATCH / DELETE 需要 `/:id`。详情返回格式以代码为准；`GET /api/state` 返回所有页面需要的集合。导出支持 `from=YYYY-MM-DD`、`to=YYYY-MM-DD`、`timezone` 和 `timezoneOffsetMinutes`。网页自动传浏览器 IANA 时区（例如 `Asia/Shanghai`、`America/New_York`），服务端按对应日期的规则处理夏令时；只有未提供 IANA 时区时才使用固定偏移。偏移是 JavaScript `getTimezoneOffset()` 的值，例如中国标准时间 `-480`，即当地时间 = UTC 减去该偏移分钟数。

完成任务：

```json
{
  "completed": true,
  "completion": {
    "startAt": "2026-10-22T09:00:00+08:00",
    "endAt": "2026-10-22T10:00:00+08:00",
    "durationMinutes": 50,
    "notes": "完成练习，休息十分钟",
    "energy": 7
  }
}
```

完成论文使用 `status: "completed"` 和同样的 `completion`。`POST .../sessions` 直接提交时段对象。以上为格式示例，请使用实际执行时间，未来时段会被拒绝。

现有 CLI 保留，核销新增必填时间参数：

```bash
bun cli.js list --all
bun cli.js add "学习数据清洗" --date 2026-10-23 --category 学习
bun cli.js done "任务ID" --start '2026-10-22T09:00:00+08:00' --end '2026-10-22T10:00:00+08:00' --minutes 50
bun cli.js undone "任务ID"
bun cli.js set-remote https://your-server.example your-api-key
```

有 Node 时可把 `bun` 替换成 `node`。Agent 建议通过 API 写入，以获得完整验证；如果直接编辑 JSON，应保留 ID、未知字段与历史时段，不绕过时间校验补造数据。

## 测试与开发

```bash
bun test                           # 后端与工具函数测试
bun run test:e2e                   # 真实 Chrome 端到端测试，需要本机 Chrome
bun run dev                        # Bun 监听服务端文件变更
```

端到端脚本使用 Playwright，默认本机 Chrome；可通过 `PLAYWRIGHT_CHANNEL` 选择已安装的其他兼容通道。测试使用临时目录，不污染个人数据。覆盖任务必填时间、核销恢复、训练明细、学习、论文阅读、财务、下载、XSS 转义、五种宽度的全部页面、深色主题与手机导航。

核心代码结构：

```text
server.js             Express 路由、认证、SSE、启动入口
lib/store.js          JSON 存储、锁、原子写入与外部变更监听
lib/validation.js     日期、时段、金额等校验
lib/models.js         任务与各记录模型
lib/exports.js        日期筛选、关联、字段字典和三种导出
public/index.html     应用框架
public/app.js         八个页面、表单和交互
public/utils.js       日期、金额、转义与显示逻辑
public/style.css      响应式视觉系统
cli.js                本地 / 远程 Agent 工具
```
