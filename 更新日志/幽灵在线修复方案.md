# 聊天室“幽灵在线”问题修复方案

**作者**：Manus AI
**日期**：2026-04-16

## 1. 问题现象与根因分析

### 1.1 现象描述
在聊天室中，当用户异常断线（如直接杀掉 App 进程、网络突然中断、手机锁屏休眠等）后，其他用户的在线列表中该用户可能长时间不会消失，形成“幽灵在线”现象。

### 1.2 根因链路
通过对 `useMqtt.ts` 的深度审查，发现该问题由以下几个机制叠加导致：

1. **缺乏异常断线通知（无 LWT 机制）**
   目前用户离开房间的逻辑依赖于主动点击“退出房间”触发 `disconnect()`，从而发送 `type: 'leave'` 消息。当发生异常断线时，客户端无法发送 `leave` 消息，其他客户端也就无法将其从 `onlineUsers` 列表中移除。
2. **心跳机制仅有发送，无超时剔除**
   客户端每 20 秒会发送一次 `type: 'heartbeat'` 消息，接收端在收到 `join` 或 `heartbeat` 时会更新用户的 `ts`（时间戳）。但是，**没有任何定时器去检查这些时间戳**。即使某个用户已经 1 小时没有发心跳，只要没收到 `leave`，他就会一直挂在列表中。
3. **Retained 消息与 ClientId 变更的潜在冲突**
   如果 `presence` 消息被错误地设置为 `retained: true`（目前代码中为 `false`，但若后续修改），或者 Broker 缓存了旧的 Session（当前 `SESSION_EXPIRY` 为 3600 秒），当用户用新的 `clientId`（当前逻辑为 `chat_${user.id}_${Date.now()}`）重连时，旧的连接状态可能会成为死状态。

## 2. 修复方案设计

为了彻底解决“幽灵在线”问题，我们需要引入**双重保障机制**：MQTT 遗嘱消息（LWT）作为服务端保障，客户端心跳超时剔除作为本地保障。

### 2.1 方案一：客户端心跳超时剔除（推荐，改动最小）

这是最简单且最符合当前架构的方案。既然客户端已经在发送心跳，我们只需要在接收端增加一个定时清理逻辑即可。

**实现逻辑**：
- 客户端 A 每 20 秒发送一次 `heartbeat`。
- 客户端 B 收到后更新 A 的 `ts`。
- 客户端 B 内部启动一个定时器（如每 10 秒执行一次），遍历 `onlineUsers` 列表。
- 如果发现某个用户的 `Date.now() - u.ts > 60000`（即 60 秒未收到心跳），则认为其已掉线，将其从列表中剔除。

**代码改动点 (`useMqtt.ts`)**：
```typescript
// 在 useMqtt 的 useEffect 中增加清理定时器
useEffect(() => {
  if (status !== 'ok') return
  
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    setOnlineUsers(prev => {
      const activeUsers = prev.filter(u => now - u.ts < 60000) // 60秒超时
      if (activeUsers.length !== prev.length) {
        // 可选：记录日志或发送系统消息
        // addLog('info', '清理超时掉线用户')
      }
      return activeUsers
    })
  }, 10000) // 每 10 秒检查一次

  return () => clearInterval(cleanupTimer)
}, [status])
```

### 2.2 方案二：MQTT 遗嘱消息 (LWT) 机制（最严谨）

遗嘱消息（Last Will and Testament）是 MQTT 协议原生提供的异常断线处理机制。当客户端连接时，向 Broker 注册一条遗嘱消息；如果客户端异常断开，Broker 会自动代为发布这条消息。

**实现逻辑**：
- 在 `mqtt.connect` 的 `options` 中增加 `will` 配置。
- 遗嘱消息的 topic 为 `chat/${roomCode}/presence`，payload 为 `type: 'leave'`。
- 当客户端异常断开时，Broker 自动向房间内所有人广播该用户离开的消息。

**代码改动点 (`useMqtt.ts`)**：
```typescript
const client = mqtt.connect(broker.url, {
  clientId,
  // ... 其他配置
  will: {
    topic: `chat/${roomCode}/presence`,
    payload: JSON.stringify({
      type: 'leave',
      senderId: user.id,
      senderName: user.name,
      senderColor: user.color
    }),
    qos: 1,
    retain: false
  }
})
```

## 3. 实施建议与风险评估

### 3.1 综合建议
**强烈建议同时实施方案一和方案二**。
- **LWT (方案二)** 能够做到秒级响应，一旦底层 TCP 连接断开，Broker 会立即广播，体验最好。
- **心跳超时 (方案一)** 作为兜底保障。在某些极端弱网情况下（如手机进入电梯），TCP 连接处于“半死不活”状态，Broker 的 KeepAlive 超时（当前配置为 60 秒）触发前不会发送 LWT，此时客户端的心跳超时机制能确保 UI 状态的最终一致性。

### 3.2 风险评估
| 风险项 | 影响评估 | 应对措施 |
|--------|----------|----------|
| **LWT 误触发** | 如果用户只是短暂网络抖动（如切换 WiFi），Broker 可能会触发 LWT 导致用户在列表中闪烁。 | 结合 MQTT 5.0 的 `willDelayInterval` 属性，设置遗嘱延迟发布（如延迟 10 秒），如果在此期间用户重连成功，则取消发布遗嘱。 |
| **心跳风暴** | 房间人数极多时，每 20 秒的心跳可能导致消息量激增。 | 当前架构下 100 人以内的房间完全可承受。若未来扩展到千人房间，需将 Presence 机制改为服务端集中管理。 |
| **时钟不同步** | 方案一依赖本地时间戳计算差值。 | 方案一使用的是 `Date.now() - u.ts`，两者都是接收端的本地时间，不依赖发送端时间，因此**不存在时钟同步问题**，非常安全。 |

## 4. 总结
当前的“幽灵在线”问题本质上是状态机缺少了“异常退出”的流转路径。通过补充 MQTT 原生的 LWT 机制和本地的心跳超时回收机制，可以以极低的代码侵入性彻底解决该问题，大幅提升聊天室的在线状态准确性。
