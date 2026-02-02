# 🎙️ 哈吉米德聊天室

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?logo=github)](https://yaahua.github.io/chatroom/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-P2P%20Mesh-orange)](https://webrtc.org/)
[![Signaling](https://img.shields.io/badge/Signaling-MQTT-purple)](https://mqtt.org/)

> 一个基于 WebRTC 的端到端加密 P2P 聊天室，支持文字、图片和语音消息。
> **无需服务器存储，数据直接在浏览器间传输，隐私无忧。**

[🌐 **立即在线体验**](https://yaahua.github.io/chatroom/)

---

## ✨ 功能特性

* 🔒 **端到端加密**：采用 WebRTC DataChannel 点对点传输核心数据，拒绝中间商赚差价，不经过中心化服务器存储。
* 🎤 **语音消息**：支持长达 60 秒的语音录制，采用分片可靠传输。拥有类微信的交互体验（按住说话、上滑取消）。
* 🖼️ **图片传输**：支持拖拽上传或直接拍照发送，内置图片压缩优化，节省带宽。
* 🌙 **深色模式**：自适应系统设置，支持手动切换浅色/深色主题，夜间聊天更护眼。
* 🔄 **最近房间**：利用本地存储自动保存最近访问的房间号，30 分钟内可快速重连。
* 👥 **多人在线**：基于 Mesh 网络架构，目前支持最多 8 人同时在线群聊。

---
## 🛠️ 技术栈

本项目是一个单文件（Single-file）Web 应用，极简且纯粹：

- **前端核心**: HTML5, CSS3 (Glassmorphism UI), Vanilla JavaScript (ES6+)
- **通信协议**: WebRTC (RTCPeerConnection, RTCDataChannel)
- **信令服务**: MQTT over WebSocket (基于 HiveMQ 公共集群)
- **媒体处理**: MediaRecorder API, OffscreenCanvas (Web Worker 图片压缩)

## 🐛 如何提交 Issue
我们非常欢迎社区反馈！为了能更高效地解决问题，请根据以下模板提交 Issue。

1. 🐞 Bug 报告
如果遇到功能异常、连接失败、UI 错误等问题，请提供：

复现步骤：如何一步步触发问题（例如：1. 点击语音按钮 2. 同意权限 3. 松开手指）。

环境信息：设备型号、操作系统、浏览器版本（例如：iPhone 14 / iOS 17.2 / Safari）。

行为对比：预期行为 vs 实际行为。

控制台日志：按 F12 → Console，复制红色的错误信息（截图或文本）。

网络环境：是否使用 VPN、公司内网、或移动数据（4G/5G）。

2. 💡 功能建议
功能描述：清晰描述您期望的新功能。

使用场景：在什么情况下会用到这个功能？解决什么痛点？

参考案例：是否有类似应用可供参考？

3. 🔌 连接问题（专用）
涉及无法连接、无法看到对方在线的问题：

在线状态：是否能看见对方头像出现在顶部列表？

网络环境：双方是否在同一 WiFi 下？是否有防火墙？

WebRTC 日志：如果可能，请提供 Chrome chrome://webrtc-internals 的关键截图或导出数据。

❓ 常见问题 (FAQ)
Q: 为什么有时候消息发送失败？
A: P2P 连接直接依赖于双方的网络环境。如果一方处于严格的企业防火墙（Symmetric NAT）或特定移动网络下，且 STUN 穿透失败，连接可能会中断。此时可能需要配置 TURN 服务器来辅助中继（本项目目前使用免费公共 STUN/TURN）。

Q: 语音消息可以保存多久？
A: 数据仅在内存中临时存储。 一旦您刷新页面或关闭浏览器，所有历史消息（包括语音和图片）都会立即消失。这是出于极致隐私保护的架构设计，我们不保存任何聊天记录。

Q: 支持多少人同时群聊？
A: 目前限制最多 8 人。由于采用 Full Mesh（全网状）架构，每个客户端需要与其他所有客户端建立连接，人数过多会导致手机发热和带宽压力过大。

Q: 手机锁屏后收不到消息？
A: 这是现代移动浏览器的系统级限制。为了省电，浏览器在后台或锁屏时会暂停 JavaScript 执行和 WebRTC 连接。建议保持屏幕常亮或在前台运行以保持连接稳定。

📄 License
MIT License © 2026 Hajimide
