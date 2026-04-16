export interface BrokerConfig {
  url: string
  username: string
  password: string
  label: string
}

// 双 Broker 配置：主 Broker（EMQX 国内）+ 备用 Broker（HiveMQ 欧洲）
export const BROKERS: BrokerConfig[] = [
  {
    url: 'wss://u5111311.ala.cn-hangzhou.emqxsl.cn:8084/mqtt',
    username: 'Hajimi',
    password: '258758',
    label: 'EMQX 主节点',
  },
  {
    url: 'wss://5b07778813ed4aceb763853468ca3f07.s1.eu.hivemq.cloud:8884/mqtt',
    username: 'Hajimi',
    password: '258758Szh',
    label: 'HiveMQ 备用节点',
  },
]

export const CONFIG = {
  // 兼容旧代码，指向主 Broker
  MQTT_URL: BROKERS[0].url,
  MQTT_USERNAME: BROKERS[0].username,
  MQTT_PASSWORD: BROKERS[0].password,

  CHUNK_SIZE: 60 * 1024,
  MAX_FILE_SIZE: 20 * 1024 * 1024,
  SESSION_EXPIRY: 3600,
  RECONNECT_BASE_DELAY: 2000,
  // 每个 Broker 最多重试 5 次，超过后切换到下一个
  MAX_RECONNECT_ATTEMPTS_PER_BROKER: 5,
  TYPING_DEBOUNCE: 2000,

  // 推送通知 topic 前缀（独立于聊天 topic）
  NOTIFY_TOPIC_PREFIX: 'notify',
} as const
