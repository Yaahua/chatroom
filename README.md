# 🎙️ 哈吉米德的聊天室 (Chatroom)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?logo=github)](https://yaahua.github.io/chatroom/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/Framework-React%2018-blue)](https://react.dev/)
[![Signaling](https://img.shields.io/badge/Signaling-MQTT-purple)](https://mqtt.org/)
[![AI](https://img.shields.io/badge/AI-DeepSeek-indigo)](https://deepseek.com/)

> 一个基于 React + TypeScript + Vite 构建的现代化实时聊天室。
> **支持多模态 AI 助手、富文本消息、语音发送与极致的移动端体验。**

[🌐 **立即在线体验**](https://yaahua.github.io/chatroom/)

---

## ✨ 核心特性

### 🤖 DeepSeek AI 助手无缝接入
- **智能唤醒**：在聊天室中发送 `@AI` 即可召唤助手，支持上下文感知与多模态图片识别。
- **定向回复**：AI 自动绑定触发者，形成 1对1 对话线程，并在气泡中显示 `@触发者` 标签。
- **流式输出**：像真人打字一样的流式响应体验，带有专属紫色渐变气泡、跳动思考动画与闪烁光标。
- **连续对话**：除了主动 `@AI`，直接长按回复 AI 的历史消息也能触发响应，保持对话连贯。

### 💬 丰富的消息交互
- **@ 提及功能**：输入 `@` 立即弹出智能面板，支持模糊匹配在线用户与 AI 助手，键盘快捷导航。
- **长按聚焦模式**：长按任意消息进入沉浸式遮罩模式，支持**回复**、**复制**文本，以及**撤回**自己发送的消息。
- **多媒体传输**：支持发送文字、图片（相册/拍照）、文件（≤20MB）以及长达 60 秒的语音录制。

### 📱 极致的移动端体验
- **动态视口适配**：采用 `100dvh` + `visualViewport` 双重保障方案，彻底解决 iOS/Android 键盘弹出及收起后上滑时输入框消失或布局错位的问题。
- **防误触机制**：针对移动端系统截图手势（如音量下+电源键）引入移动阈值、多点触控及页面失焦三重防护，防止误触长按遮罩。
- **滚动优化**：输入框内编辑长文本时拥有独立滚动区域，不会触发外层页面滚动；消息列表仅在用户处于底部时才自动滚动。

### 🛡️ 稳定与可靠
- **幽灵在线防护**：结合 MQTT 遗嘱消息 (LWT) 与本地心跳超时剔除（60秒）双重机制，彻底解决异常断线导致的“幽灵在线”问题。
- **消息去重**：利用 `localStorage` 持久化 AI 已处理消息 ID，防止重进房间时重复触发；统一本地与远端消息 ID，防止 Broker Echo 导致文件/语音消息重复。
- **资源管理**：严格的 `AudioContext` 生命周期管理与 `ObjectURL` 内存释放，拒绝内存泄漏。

---

## 🛠️ 技术栈

本项目已从早期的单文件原生 JS 架构全面重构为现代化的前端工程：

- **核心框架**: React 18, TypeScript, Vite
- **状态管理**: React Hooks (自定义 `useMqtt`, `useAI`, `useSound` 等)
- **通信协议**: MQTT over WebSocket (基于 EMQX Cloud)
- **AI 引擎**: DeepSeek API (支持 Vision 多模态)
- **样式方案**: 原生 CSS3 (CSS Variables, Glassmorphism UI, 动态视口单位)

---

## 📂 目录结构

```text
chatroom/
├── src/
│   ├── components/       # 职责单一的 UI 组件
│   │   ├── App.tsx           # 核心容器与状态分发
│   │   ├── ChatHeader.tsx    # 顶部导航与在线人数
│   │   ├── MessageList.tsx   # 消息流渲染与长按交互
│   │   ├── InputBar.tsx      # 底部输入区域与多媒体面板
│   │   ├── AtMentionPanel.tsx# @ 提及智能补全列表
│   │   ├── FocusOverlay.tsx  # 长按聚焦沉浸式菜单
│   │   ├── Modals.tsx        # 全局弹窗（在线列表、日志等）
│   │   └── LoginView.tsx     # 登录与房间加入界面
│   ├── hooks/            # 核心业务逻辑
│   │   ├── useMqtt.ts        # MQTT 连接、收发与在线状态管理
│   │   ├── useAI.ts          # DeepSeek API 调用与流式解析
│   │   └── useSound.ts       # AudioContext 音效管理
│   ├── types.ts          # 全局 TypeScript 类型定义
│   ├── config.ts         # 环境配置与常量
│   └── index.css         # 全局样式与主题变量
└── 更新日志/             # 详细的版本更新记录 (CHANGELOG)
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

3. **配置环境变量**
   在根目录创建 `.env.local` 文件，填入您的 DeepSeek API Key：
   ```env
   VITE_DEEPSEEK_API_KEY=sk-your-api-key-here
   ```

4. **启动开发服务器**
   ```bash
   pnpm dev
   ```

5. **构建生产版本**
   ```bash
   pnpm build
   ```

---

## 📄 更新日志

详细的重构与 Bug 修复记录请查看 [更新日志目录](./更新日志/)。

---

## 📜 License

MIT License © 2026 Hajimide
