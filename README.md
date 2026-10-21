# 📱 智能代办日历看板 (Mobile Todo & Calendar)

专为**手机端查看与核销** + **本地电脑端 AI Agent 智能管理**设计的现代 Web 应用。

---

## 🌟 核心特性

1. **移动端友好（Mobile-First）**：
   - 适配 iOS Safari / Android Chrome 沉浸式手势与刘海屏（Safe Area Insets）。
   - 一键**点击圆圈核销任务**，具备平滑动画与轻微触觉/音效反馈。
   - 横向日历栏（按周滑动、支持定位到指定日期查看事项）。
   - 分类标签（工作、生活、学习、健身、待办）与优先级标记（紧急/优先/普通）。
   - 支持深色 / 浅色模式自由切换。

2. **本地电脑端 Agent 互联**：
   - **双向实时同步（Server-Sent Events）**：无需在手机上手动刷新页面，电脑端 Agent 增删改查任务后，手机端界面秒级自动更新并弹出提示！
   - **Agent 快速终端指令**：
     - `node cli.js list`：查看待办事项
     - `node cli.js add "任务标题" --date 2026-10-22 --priority high --category 工作`：新增事项
     - `node cli.js done "<ID或关键词>"`：标记完成核销
     - `node cli.js undone "<ID或关键词>"`：恢复待办状态
     - `node cli.js delete "<ID或关键词>"`：删除事项
   - **直接文件驱动**：数据存储于 `data/todos.json`，Agent 甚至可以直接读取/写入该 JSON 文件，服务端自动热监听并推送至手机端。

3. **手机一键连接**：
   - 电脑控制台自动生成终端二维码。
   - 网页右上角内置 **手机扫码 / 网络连接** 弹窗，显示局域网直连网址与高清二维码。

---

## 🚀 启动与运行

项目位于：`~/Documents/mobile-todo`

```bash
cd ~/Documents/mobile-todo

# 启动服务（默认监听 0.0.0.0:3000）
npm start
```

- **电脑本地访问**：[http://localhost:3000](http://localhost:3000)
- **手机局域网访问**：`http://<电脑局域网IP>:3000`（手机需与电脑连接同一 Wi-Fi）
