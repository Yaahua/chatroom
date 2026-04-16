# 🎙️ 哈吉米德的聊天室 (Chatroom)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?logo=github)](https://yaahua.github.io/chatroom/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/Framework-React%2018-blue)](https://react.dev/)
[![Signaling](https://img.shields.io/badge/Signaling-MQTT-purple)](https://mqtt.org/)
[![AI](https://img.shields.io/badge/AI-DeepSeek%20%7C%20Moonshot-indigo)](https://deepseek.com/)

> 一个基于 React + TypeScript + Vite 构建的现代化实时聊天室。
> **支持多模态 AI 助手、富文本消息、语音发送与极致的移动端体验。**

[🌐 **立即在线体验**](https://yaahua.github.io/chatroom/)

---

## ✨ 核心特性

### 🤖 双引擎 AI 助手无缝接入
- **智能唤醒**：在聊天室中点击 `@` 按钮，可唤出两阶段助手面板，支持唤起 **DeepSeek**（深度推理）与 **Kimi**（长文理解）两位专属 AI。
- **快捷指令**：内置多种快捷指令（如"总结聊天"、"润色文字"、"来玩海龟汤"等），选中后自动填入输入框，可无缝追加追问内容。
- **流式输出与思考过程**：像真人打字一样的流式响应体验，DeepSeek 助手支持展示**深度思考（Reasoning）**过程，并支持折叠/展开。
- **定向回复**：AI 自动绑定触发者，形成 1对1 对话线程，直接长按回复 AI 的历史消息也能触发响应，保持对话连贯。

### 💬 丰富的消息交互
- **@ 提及与通知**：键盘输入 `@` 立即弹出智能面板，支持模糊匹配在线用户与 AI 助手。被 @ 时消息气泡左侧显示橙色标记，标题栏出现 `@N` 角标。
- **长按聚焦模式**：长按任意消息进入沉浸式遮罩模式，支持**回复**、**复制**文本，以及**撤回**自己发送的消息。桌面端支持鼠标悬停快捷操作。
- **多媒体传输**：支持发送文字、图片（相册/拍照）、文件（≤20MB）以及长达 60 秒的语音录制（带播放进度条反馈）。
- **图片手势缩放**：内置高性能图片查看器，移动端支持双指缩放、拖拽平移，桌面端支持鼠标滚轮缩放与双击还原。

### 📱 极致的移动端体验
- **动态视口适配**：采用 `100dvh` + `visualViewport` 双重保障方案，彻底解决 iOS/Android 键盘弹出及收起后上滑时输入框消失或布局错位的问题。
- **防误触机制**：针对移动端系统截图手势引入移动阈值、多点触控及页面失焦三重防护，防止误触长按遮罩。
- **智能滚动**：输入框内编辑长文本时拥有独立滚动区域；消息列表仅在用户处于底部时才自动滚动，用户主动上翻时暂停跟随，并提供平滑的"回到底部"按钮。

### 🛡️ 稳定与可靠
- **幽灵在线防护**：结合 MQTT 遗嘱消息 (LWT) 与本地心跳超时剔除双重机制，彻底解决异常断线导致的"幽灵在线"问题。
- **消息去重**：利用 `localStorage` 持久化 AI 已处理消息 ID，防止重进房间时重复触发；统一本地与远端消息 ID，防止 Broker Echo 导致文件重复。
- **优雅的降级处理**：首屏登录页内置日本辞世诗（双列网格布局）轮换展示，提升等待与连接过程中的文化氛围。网易云音乐卡片接入高可用镜像 API 保证服务稳定。

---

## 🛠️ 技术栈

本项目已从早期的单文件原生 JS 架构全面重构为现代化的前端工程：

| 层级 | 技术 |
|------|------|
| **核心框架** | React 18, TypeScript, Vite |
| **状态管理** | React Hooks（自定义 `useMqtt`, `useAI`, `useSound` 等） |
| **通信协议** | MQTT over WebSocket（基于 EMQX Cloud） |
| **AI 引擎** | DeepSeek API, Moonshot (Kimi) API（流式 SSE） |
| **样式方案** | 原生 CSS3（CSS Variables、动态视口单位 `dvh`、Grid 布局） |

---

## 📂 目录结构

```text
chatroom/
├── src/
│   ├── components/           # 职责单一的 UI 组件
│   │   ├── App.tsx               # 核心容器与状态分发
│   │   ├── ChatHeader.tsx        # 顶部导航、在线人数、高级选项
│   │   ├── MessageList.tsx       # 消息流渲染、智能滚动、长按交互
│   │   ├── InputBar.tsx          # 底部输入区域、多阶段 @ 面板、录音
│   │   ├── AtMentionPanel.tsx    # @ 提及智能补全列表
│   │   ├── FocusOverlay.tsx      # 长按聚焦沉浸式菜单
│   │   ├── Modals.tsx            # 全局弹窗（图片缩放、在线列表等）
│   │   ├── LoginView.tsx         # 登录与房间加入界面
│   │   └── JiseiDisplay.tsx      # 登录页辞世诗双列网格轮换组件
│   ├── data/                 # 静态数据源
│   │   └── deathPoems.ts         # 50首日本辞世诗中译数据集
│   ├── useMqtt.ts            # MQTT 连接、收发与在线状态管理
│   ├── useAI.ts              # 双引擎 AI API 调用与流式解析
│   ├── types.ts              # 全局 TypeScript 类型定义
│   ├── config.ts             # 环境配置与常量
│   └── index.css             # 全局样式与主题变量
├── 更新日志/                 # 详细的版本更新记录 (CHANGELOG)
└── 待实施方案/               # 已规划但暂未上线的功能方案
```

---

## 🚀 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/Yaahua/chatroom.git
   cd chatroom
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发服务器**
   ```bash
   pnpm dev
   ```

4. **构建生产版本**
   ```bash
   pnpm build
   ```

---

## 📄 更新日志

详细的重构与 Bug 修复记录请查看 [更新日志目录](./更新日志/)。

---

## 📜 License

MIT License © 2026 Hajimide
