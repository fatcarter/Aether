import type { PublicGlobalModel } from '@/api/public-models'
import type { ModelStatusMonitor } from '@/api/endpoints/types'
import { API_FORMAT_LABELS } from '@/api/endpoints/types/api-format'

/** 模型厂商信息：用于卡片左上角图标与底部厂商标签、以及厂商过滤。 */
export interface VendorInfo {
  /** 厂商稳定标识，用于过滤 */
  id: string
  /** 展示名称，如 OpenAI / Anthropic */
  label: string
  /** 本地品牌图标路径；系统未知厂商为 null，使用默认占位图 */
  iconUrl: string | null
}

interface VendorRule {
  id: string
  label: string
  iconUrl: string | null
  /** 命中该厂商的模型名关键字（小写子串匹配） */
  keywords: string[]
}

// 品牌图标仅使用仓库内已有的本地资源，避免外链与 CSP 问题；
// 其余厂商共用默认占位图（由卡片组件渲染），但仍保留独立的厂商标签用于过滤展示。
const VENDOR_RULES: readonly VendorRule[] = [
  { id: 'anthropic', label: 'Anthropic', iconUrl: '/claude-color.svg', keywords: ['claude', 'anthropic'] },
  { id: 'google', label: 'Google', iconUrl: '/gemini-color.svg', keywords: ['gemini', 'gemma', 'palm', 'bison', 'imagen', 'veo'] },
  { id: 'openai', label: 'OpenAI', iconUrl: '/openai.svg', keywords: ['gpt', 'chatgpt', 'o1', 'o3', 'o4-', 'davinci', 'codex', 'dall-e', 'dalle', 'whisper', 'text-embedding', 'omni', 'sora'] },
  { id: 'xai', label: 'xAI', iconUrl: null, keywords: ['grok'] },
  { id: 'deepseek', label: 'DeepSeek', iconUrl: null, keywords: ['deepseek'] },
  { id: 'qwen', label: '通义千问', iconUrl: null, keywords: ['qwen', 'qwq', 'tongyi'] },
  { id: 'moonshot', label: 'Moonshot', iconUrl: null, keywords: ['moonshot', 'kimi'] },
  { id: 'zhipu', label: '智谱', iconUrl: null, keywords: ['glm', 'chatglm'] },
  { id: 'meta', label: 'Meta', iconUrl: null, keywords: ['llama'] },
  { id: 'mistral', label: 'Mistral', iconUrl: null, keywords: ['mistral', 'mixtral', 'codestral'] },
  { id: 'cohere', label: 'Cohere', iconUrl: null, keywords: ['command-r', 'cohere'] },
  { id: 'doubao', label: '豆包', iconUrl: null, keywords: ['doubao'] },
  { id: 'baidu', label: '百度', iconUrl: null, keywords: ['ernie'] },
  { id: 'minimax', label: 'MiniMax', iconUrl: null, keywords: ['minimax', 'abab'] },
  { id: 'yi', label: '零一万物', iconUrl: null, keywords: ['yi-'] },
  { id: 'stepfun', label: '阶跃星辰', iconUrl: null, keywords: ['step-'] },
]

const UNKNOWN_VENDOR: VendorInfo = { id: 'unknown', label: '其他', iconUrl: null }

/** 根据模型 id/名称推断厂商（来源）。未知厂商返回统一的「其他」。 */
export function detectVendor(modelName: string | null | undefined): VendorInfo {
  const name = (modelName ?? '').toLowerCase()
  if (!name) return UNKNOWN_VENDOR
  for (const rule of VENDOR_RULES) {
    if (rule.keywords.some((keyword) => name.includes(keyword))) {
      return { id: rule.id, label: rule.label, iconUrl: rule.iconUrl }
    }
  }
  return UNKNOWN_VENDOR
}

/** 卡片展示所需的价格信息（单位：美元 / 每百万 token）。null 表示未配置。 */
export interface PlazaPricing {
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
}

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  }
  return null
}

/**
 * 从模型的默认阶梯计费中提取首档价格，用于卡片展示。
 * 仅取第一个阶梯（多数模型为单档），阶梯计费的完整明细不在广场展示。
 */
export function extractPricing(model: PublicGlobalModel): PlazaPricing {
  const tier = model.default_tiered_pricing?.tiers?.[0]
  if (!tier) {
    return { input: null, output: null, cacheRead: null, cacheWrite: null }
  }
  return {
    input: firstPositive(tier.input_price_per_1m),
    output: firstPositive(tier.output_price_per_1m),
    cacheRead: firstPositive(tier.cache_read_price_per_1m),
    cacheWrite: firstPositive(tier.cache_creation_price_per_1m),
  }
}

/** 从模型 config 中读取支持的端点类型（api_format 原始标识列表）。 */
export function getEndpointFormats(model: PublicGlobalModel): string[] {
  const raw = model.config?.api_formats
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

/** 将 api_format 原始标识映射为展示名称，未知标识回退为原始值。 */
export function endpointFormatLabel(apiFormat: string): string {
  return API_FORMAT_LABELS[apiFormat] ?? apiFormat
}

/** 最近 24 小时中的单个小时桶，用于状态条展示。 */
export interface HourBucket {
  /** 0..hours-1，末尾为最近一小时 */
  index: number
  startMs: number
  endMs: number
  /** 成功率 0..1；无数据为 null（渲染为中性灰） */
  successRate: number | null
  total: number
}

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/**
 * 将健康监控返回的时间线明细重新聚合为固定的 24 个小时桶。
 *
 * 健康接口按固定段数（非整点）切分时间线，此处按每段的时间中点归入对应的整点小时，
 * 并累加成功/总次数得到每小时成功率。计数为累加，成功率精确；边界略有取整属预期。
 */
export function buildHourlyBuckets(
  details: ModelStatusMonitor['timeline_details'] | undefined,
  hours = 24,
  nowMs: number = Date.now(),
): HourBucket[] {
  const hourMs = 3600_000
  const windowStart = nowMs - hours * hourMs
  const buckets: HourBucket[] = Array.from({ length: hours }, (_, index) => ({
    index,
    startMs: windowStart + index * hourMs,
    endMs: windowStart + (index + 1) * hourMs,
    successRate: null,
    total: 0,
  }))
  const success = new Array<number>(hours).fill(0)

  for (const detail of details ?? []) {
    const startMs = parseTimeMs(detail?.time_range_start)
    const endMs = parseTimeMs(detail?.time_range_end)
    const midMs = startMs != null && endMs != null ? (startMs + endMs) / 2 : startMs ?? endMs
    if (midMs == null) continue
    const slot = Math.floor((midMs - windowStart) / hourMs)
    if (slot < 0 || slot >= hours) continue
    const total = typeof detail?.total_attempts === 'number' ? detail.total_attempts : 0
    const ok = typeof detail?.success_count === 'number' ? detail.success_count : 0
    buckets[slot].total += total
    success[slot] += ok
  }

  for (const bucket of buckets) {
    if (bucket.total > 0) {
      bucket.successRate = Math.min(1, Math.max(0, success[bucket.index] / bucket.total))
    }
  }
  return buckets
}

/**
 * 根据成功率返回状态条颜色：100% 纯绿、0% 纯红、中间过渡为橙色。
 * 无数据（null）返回中性灰。
 */
export function successRateColor(rate: number | null): string {
  if (rate == null) return 'hsl(220 9% 82%)'
  const clamped = Math.min(1, Math.max(0, rate))
  // 分段线性：0→红(0°)，0.5→橙(38°)，1→绿(132°)
  const hue = clamped < 0.5 ? clamped * 2 * 38 : 38 + (clamped - 0.5) * 2 * 94
  return `hsl(${Math.round(hue)} 78% 44%)`
}

/** 成功率格式化为百分比字符串，null → '—'。 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

/** TPS 格式化，null → '—'。 */
export function formatTps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return value >= 100 ? `${Math.round(value)}` : value.toFixed(1)
}

/** 首字延迟格式化：<1s 显示毫秒，≥1s 显示秒；null → '—'。 */
export function formatLatency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`
}

/** 价格格式化（美元/百万 token），null → '—'。 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `$${value.toFixed(2)}`
}


