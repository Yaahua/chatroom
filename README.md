# 🎙️ 哈吉米德的聊天室

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?logo=github)](https://yaahua.github.io/chatroom/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![P2P](https://img.shields.io/badge/Architecture-P2P%20Mesh-orange)](https://webrtc.org/)
[![MQTT](https://img.shields.io/badge/Signaling-MQTT-purple)](https://mqtt.org/)

&gt; 一个基于 WebRTC 的端到端加密 P2P 聊天室，支持文字、图片和语音消息。无需服务器存储，数据直接在浏览器间传输。

[🌐 在线体验](https://yaahua.github.io/chatroom/) 

---

## ✨ 功能特性

- 🔒 **端到端加密**：所有消息通过 WebRTC DataChannel 点对点传输，不经过中心化服务器
- 🎤 **语音消息**：支持 60 秒语音录制，分片传输，类微信交互体验（按住说话/上滑取消）
- 🖼️ **图片传输**：支持拖拽/拍照发送图片，自动压缩优化
- 🌙 **深色模式**：支持浅色/深色主题切换
- 🔄 **最近房间**：自动保存最近访问的房间，30 分钟内可快速重连
- 👥 **多人在线**：支持最多 8 人同时在线（Mesh 网络）

---

## 🐛 如何提交 Issue
提交前检查
[ ] 已查阅 FAQ 没有找到解决方案
[ ] 已搜索现有 Issues，确认没有重复问题
[ ] 使用的是最新版本的代码（尝试刷新页面 Ctrl+F5 / Cmd+Shift+R）
### Issue 模板选择
#### 🐞 Bug 报告
如果遇到功能异常、连接失败、UI 错误等问题，请包含：
复现步骤：如何一步步触发问题
环境信息：设备型号、操作系统、浏览器版本（如 iPhone 14 / iOS 17 / Safari）
预期行为 vs 实际行为
控制台日志：按 F12 → Console 复制红色错误信息
网络环境：是否使用 VPN、公司网络、移动数据
#### 💡 功能建议
功能描述：清晰描述需要什么功能
使用场景：什么情况下会用到
参考案例：是否有类似应用可供参考
#### 🔌 连接问题（专门模板）
是否能看见对方在线？
双方网络环境（是否同一 WiFi、是否有防火墙）
控制台 webrtc-internals 日志（Chrome 访问 chrome://webrtc-internals）
### ❓ 常见问题
#### Q: 为什么有时候消息发送失败？
#### A: P2P 连接需要双方网络都支持 WebRTC。如果一方在企业防火墙/NAT 后，可能需要通过 TURN 服务器中继。
#### Q: 语音消息可以保存多久？
#### A: 语音数据仅在内存中临时存储，刷新页面后所有历史消息都会消失。这是出于隐私保护的架构设计。
#### Q: 支持群聊吗？
#### A: 支持，目前限制最多 8 人。
#### Q: 手机锁屏后收不到消息？
#### A: 这是浏览器限制，WebRTC 在页面不可见时会被暂停。
