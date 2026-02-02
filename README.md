# 🎙️ 哈吉米德的聊天室

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

