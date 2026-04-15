# 聊天室零成本后端接入指南

本指南将手把手教你如何申请并配置 **EMQX Cloud Serverless**（作为信令服务器）和 **Metered OpenRelay**（作为 TURN 穿透服务器），并提供可直接替换到你现有 `index.html` 中的代码。

---

## 步骤一：配置 EMQX Cloud Serverless

原项目使用的是硬编码的 HiveMQ 公共测试服务器，这会导致所有人的消息混在一起，且极易断线。我们将替换为你自己专属的免费 MQTT 服务器。

### 1. 注册与创建部署
1. 访问 [EMQX Cloud 官网](https://www.emqx.com/zh/cloud) 并注册账号。
2. 登录控制台，点击 **新建部署**。
3. 选择 **Serverless** 版本。
4. **消费限额** 保持默认的 `0` 即可（这意味着超出免费额度后会自动停止，绝不会扣费）。
5. 点击 **立即部署**，等待约 5 秒钟，状态变为"运行中"。

### 2. 获取连接信息
1. 点击进入刚刚创建的部署详情页。
2. 在 **基本信息** 中找到 **连接地址**（例如：`xxxxxx.s1.s.emqxsl.com`）。
3. 记下这个地址，它将替换代码中的 `MQTT_URL`。

### 3. 设置认证信息（非常重要）
为了安全，必须设置账号密码，否则无法连接：
1. 在左侧菜单找到 **访问控制 -> 客户端认证**。
2. 点击 **添加**，输入一个用户名（如 `chatroom_user`）和密码（如 `your_secure_password`）。
3. 记下这组账号密码，它们将替换代码中的 `MQTT_USERNAME` 和 `MQTT_PASSWORD`。

---

## 步骤二：配置 Metered OpenRelay

原项目可能只使用了公共的 STUN 服务器（如 Google 的），在复杂的国内网络（如校园网、公司内网）下，WebRTC 的 P2P 连接会失败。我们需要接入 TURN 服务器来做流量中继。

### 1. 注册获取 API Key
1. 访问 [Metered OpenRelay 官网](https://www.metered.ca/tools/openrelay/)。
2. 点击 **Signup for free account** 注册一个免费账号。
3. 登录后，在控制台首页你就能看到你的专属 **API Key** 或直接提供给你的 `iceServers` 数组配置。
4. 记下这个 API Key 或 `iceServers` 列表。

---

## 步骤三：替换前端代码

打开你的 `index.html`，我们需要修改两个地方的代码。

### 修改点 1：替换全局配置

找到代码顶部的 `CONFIG` 对象，将其替换为你刚刚获取的信息：

```javascript
const CONFIG = {
    // 替换为你 EMQX 的连接地址，注意保留 wss:// 前缀和 :8084/mqtt 后缀
    MQTT_URL: 'wss://你的连接地址.s1.s.emqxsl.com:8084/mqtt',
    
    // 替换为你刚刚在 EMQX 设置的客户端认证账号密码
    MQTT_USERNAME: 'chatroom_user',
    MQTT_PASSWORD: 'your_secure_password',
    
    // 替换为你的 Metered API Key
    METERED_API_KEY: '你的Metered_API_KEY',
    
    CHUNK_SIZE: 80 * 1024,
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    SESSION_EXPIRY: 3600,
    RECONNECT_BASE_DELAY: 2000,
    MAX_RECONNECT_ATTEMPTS: 10,
    TIMEOUT: 120000,
    KEY_EXCHANGE_TIMEOUT: 10000
};
```

### 修改点 2：动态获取 TURN 服务器配置

原项目在初始化 WebRTC (`RTCPeerConnection`) 时，可能使用的是写死的 STUN 服务器。我们需要修改这部分逻辑，让它在连接前，先通过 API 获取 Metered 的 TURN 配置。

在你的 `App` 类或 WebRTC 初始化的相关方法中，加入以下获取配置的逻辑：

```javascript
// 新增一个异步方法来获取 ICE Servers 配置
async getIceServers() {
    try {
        // 调用 Metered API 获取离你最近的 TURN 服务器节点
        const response = await fetch(`https://你的应用名前缀.metered.live/api/v1/turn/credentials?apiKey=${CONFIG.METERED_API_KEY}`);
        const iceServers = await response.json();
        
        // 建议加上几个免费的 STUN 作为兜底
        iceServers.push(
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun.qq.com:3478" }
        );
        
        return iceServers;
    } catch (e) {
        console.error('获取 TURN 配置失败，降级使用公共 STUN:', e);
        return [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun.qq.com:3478" }
        ];
    }
}

// 在创建 RTCPeerConnection 时使用动态获取的配置
async createPeerConnection(targetId) {
    // 先获取配置
    const iceServers = await this.getIceServers();
    
    // 初始化连接
    const pc = new RTCPeerConnection({
        iceServers: iceServers,
        iceTransportPolicy: 'all' // 允许使用所有类型的候选者（包括 relay）
    });
    
    // ... 绑定 onicecandidate, ontrack 等事件 ...
    
    return pc;
}
```

*(注意：由于你提供的原项目代码被截断了，请根据你实际的 WebRTC 初始化逻辑（通常在 `createPeerConnection` 或类似方法中）将上述 `iceServers` 注入到 `RTCPeerConnection` 的构造函数中。)*

---

## 总结

完成以上三步后，你的聊天室就完成了"脱胎换骨"：
1. **信令完全私有化**：再也不用担心和别人串线，连接速度和稳定性大幅提升。
2. **穿透成功率拉满**：有了 TURN 服务器兜底，即使在公司防火墙或对称 NAT 网络下，视频和文件传输也能顺畅进行。
3. **零成本**：只要不超过每月 100万分钟（EMQX）和 500MB 中继（Metered），你一分钱都不用花。

你可以直接把修改后的 `index.html` 推送到 GitHub Pages，它立刻就能工作！
