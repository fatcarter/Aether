<template>
  <div class="space-y-4 pb-8">
    <!-- 筛选栏 -->
    <Card class="p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-baseline gap-2">
          <h2 class="text-base font-semibold shrink-0">
            模型广场
          </h2>
          <span class="text-xs text-muted-foreground">
            {{ filteredCards.length }} / {{ cards.length }} 个模型
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- 搜索 -->
          <div class="relative">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="model-plaza-search"
              v-model="searchQuery"
              type="text"
              placeholder="搜索模型..."
              aria-label="搜索模型"
              class="w-36 sm:w-52 pl-8 pr-3 h-8 text-sm"
            />
          </div>

          <!-- 厂商过滤 -->
          <Select v-model="vendorFilter">
            <SelectTrigger
              class="h-8 w-32 text-sm"
              aria-label="按厂商过滤"
            >
              <SelectValue placeholder="厂商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                全部厂商
              </SelectItem>
              <SelectItem
                v-for="option in vendorOptions"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- 端点类型过滤 -->
          <Select v-model="endpointFilter">
            <SelectTrigger
              class="h-8 w-40 text-sm"
              aria-label="按端点类型过滤"
            >
              <SelectValue placeholder="端点类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                全部端点
              </SelectItem>
              <SelectItem
                v-for="option in endpointOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <RefreshButton
            :loading="loading"
            @click="refreshData"
          />
        </div>
      </div>
    </Card>

    <!-- 加载骨架 -->
    <div
      v-if="loading && cards.length === 0"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      <Skeleton
        v-for="n in 8"
        :key="n"
        class="h-56 rounded-xl"
      />
    </div>

    <!-- 空状态 -->
    <Card
      v-else-if="filteredCards.length === 0"
      class="p-12 text-center text-sm text-muted-foreground"
    >
      {{ cards.length === 0 ? '暂无可用模型' : '没有找到匹配的模型' }}
    </Card>

    <!-- 卡片网格 -->
    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <article
          v-for="card in pagedCards"
          :key="card.id"
          class="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <!-- 顶部：厂商图标 + 模型名 + 端点类型 -->
          <div class="flex items-start gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background"
            >
              <img
                v-if="card.vendor.iconUrl"
                :src="card.vendor.iconUrl"
                :alt="card.vendor.label"
                class="h-5 w-5 object-contain"
                loading="lazy"
              >
              <Boxes
                v-else
                class="h-5 w-5 text-muted-foreground"
              />
            </div>
            <div class="min-w-0 flex-1">
              <h3
                class="truncate text-sm font-semibold"
                :title="card.title"
              >
                {{ card.title }}
              </h3>
              <div
                v-if="card.endpoints.length"
                class="mt-1 flex flex-wrap gap-1"
              >
                <Badge
                  v-for="fmt in card.endpoints"
                  :key="fmt"
                  variant="secondary"
                  class="px-1.5 py-0 text-[10px] font-normal"
                >
                  {{ endpointFormatLabel(fmt) }}
                </Badge>
              </div>
            </div>
          </div>

          <!-- 价格（美元 / 每百万 token） -->
          <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted-foreground">输入</span>
              <span class="font-medium tabular-nums">{{ formatPrice(card.pricing.input) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted-foreground">补全</span>
              <span class="font-medium tabular-nums">{{ formatPrice(card.pricing.output) }}</span>
            </div>
            <div
              v-if="card.pricing.cacheRead !== null"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-muted-foreground">缓存读</span>
              <span class="font-medium tabular-nums">{{ formatPrice(card.pricing.cacheRead) }}</span>
            </div>
            <div
              v-if="card.pricing.cacheWrite !== null"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-muted-foreground">缓存写</span>
              <span class="font-medium tabular-nums">{{ formatPrice(card.pricing.cacheWrite) }}</span>
            </div>
          </div>

          <div class="mt-auto space-y-2">
            <!-- 厂商标签 + 性能指标 -->
            <div class="flex items-center justify-between gap-2">
              <span
                class="truncate text-xs text-muted-foreground"
                :title="card.vendor.label"
              >
                {{ card.vendor.label }}
              </span>
              <div class="flex items-center gap-2.5 text-xs tabular-nums">
                <span
                  class="flex items-center gap-0.5"
                  title="吞吐速率 (tokens/s)"
                >
                  <Zap class="h-3 w-3 text-amber-500" />
                  {{ formatTps(card.metric?.avg_tps) }}
                </span>
                <span
                  class="flex items-center gap-0.5"
                  title="首字延迟"
                >
                  <Timer class="h-3 w-3 text-sky-500" />
                  {{ formatLatency(card.metric?.avg_first_byte_ms) }}
                </span>
                <span
                  class="flex items-center gap-0.5"
                  title="成功率（最近 24 小时）"
                >
                  <CircleCheck class="h-3 w-3 text-emerald-500" />
                  {{ formatPercent(card.metric?.success_rate) }}
                </span>
              </div>
            </div>

            <!-- 最近 24 小时可用性状态条 -->
            <div
              class="flex h-6 items-stretch gap-px"
              role="img"
              :aria-label="`最近 24 小时可用性：${formatPercent(card.metric?.success_rate)}`"
            >
              <span
                v-for="bucket in card.buckets"
                :key="bucket.index"
                class="flex-1 rounded-[1px]"
                :style="{ backgroundColor: successRateColor(bucket.successRate) }"
                :title="bucketTooltip(bucket)"
              />
            </div>
          </div>
        </article>
      </div>

      <!-- 分页 -->
      <div
        v-if="filteredCards.length > pageSize"
        class="pt-2"
      >
        <Pagination
          :current="currentPage"
          :total="filteredCards.length"
          :page-size="pageSize"
          cache-key="model-plaza-page-size"
          @update:current="currentPage = $event"
          @update:page-size="pageSize = $event"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Search, Boxes, Zap, Timer, CircleCheck } from 'lucide-vue-next'
import {
  Card,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Skeleton,
  Pagination,
  RefreshButton,
} from '@/components/ui'
import { useToast } from '@/composables/useToast'
import { parseApiError } from '@/utils/errorParser'
import { log } from '@/utils/logger'
import { meApi } from '@/api/me'
import { getPublicModelStatusMonitor } from '@/api/endpoints/health'
import type { PublicGlobalModel } from '@/api/public-models'
import type { ModelStatusMonitor } from '@/api/endpoints/types'
import {
  detectVendor,
  extractPricing,
  getEndpointFormats,
  endpointFormatLabel,
  buildHourlyBuckets,
  successRateColor,
  formatPercent,
  formatTps,
  formatLatency,
  formatPrice,
  type VendorInfo,
  type PlazaPricing,
  type HourBucket,
} from './model-plaza-helpers'

const { error: showError } = useToast()

/** 卡片聚合视图模型：合并模型基础信息、厂商、价格、端点、健康指标与 24 小时可用性桶。 */
interface PlazaCard {
  id: string
  title: string
  vendor: VendorInfo
  pricing: PlazaPricing
  endpoints: string[]
  metric: ModelStatusMonitor | null
  buckets: HourBucket[]
  searchText: string
}

const loading = ref(false)
const searchQuery = ref('')
const vendorFilter = ref('all')
const endpointFilter = ref('all')
const currentPage = ref(1)
const pageSize = ref(20)

const models = ref<PublicGlobalModel[]>([])
const metricsByModel = ref<Map<string, ModelStatusMonitor>>(new Map())
// 数据加载时刻，用于将健康时间线按整点重新分桶（避免随渲染频繁变化）
const nowMs = ref(Date.now())

// 合并可用模型与健康指标（按模型名关联），构建卡片视图模型
const cards = computed<PlazaCard[]>(() =>
  models.value.map((model) => {
    const metric = metricsByModel.value.get(model.name) ?? null
    const vendor = detectVendor(model.name)
    return {
      id: model.id,
      title: model.name,
      vendor,
      pricing: extractPricing(model),
      endpoints: getEndpointFormats(model),
      metric,
      buckets: buildHourlyBuckets(metric?.timeline_details, 24, nowMs.value),
      searchText: `${model.name} ${model.display_name ?? ''} ${vendor.label}`.toLowerCase(),
    }
  }),
)

// 厂商过滤选项：取自当前模型集合中出现过的厂商
const vendorOptions = computed(() => {
  const map = new Map<string, string>()
  for (const card of cards.value) {
    if (!map.has(card.vendor.id)) map.set(card.vendor.id, card.vendor.label)
  }
  return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
    a.label.localeCompare(b.label, 'zh-Hans-CN'),
  )
})

// 端点类型过滤选项：取自当前模型集合中出现过的 api_format
const endpointOptions = computed(() => {
  const set = new Set<string>()
  for (const card of cards.value) {
    for (const fmt of card.endpoints) set.add(fmt)
  }
  return Array.from(set, (value) => ({ value, label: endpointFormatLabel(value) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
})

// 按厂商、端点类型与关键词（空格分隔的多关键词 AND）过滤
const filteredCards = computed(() => {
  const keywords = searchQuery.value.toLowerCase().split(/\s+/).filter((k) => k.length > 0)
  const vendor = vendorFilter.value
  const endpoint = endpointFilter.value
  return cards.value.filter((card) => {
    if (vendor !== 'all' && card.vendor.id !== vendor) return false
    if (endpoint !== 'all' && !card.endpoints.includes(endpoint)) return false
    if (keywords.length && !keywords.every((k) => card.searchText.includes(k))) return false
    return true
  })
})

const pagedCards = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredCards.value.slice(start, start + pageSize.value)
})

// 过滤条件变化时回到第一页
watch([searchQuery, vendorFilter, endpointFilter], () => {
  currentPage.value = 1
})

// 结果数或每页大小变化时，防止当前页越界
watch([filteredCards, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredCards.value.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

/** 状态条单格的悬浮说明：整点时刻 + 成功率 + 样本数，无数据时提示。 */
function bucketTooltip(bucket: HourBucket): string {
  const time = new Date(bucket.startMs).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (bucket.total === 0 || bucket.successRate === null) return `${time} 无数据`
  return `${time} 成功率 ${formatPercent(bucket.successRate)}（${bucket.total} 次）`
}

async function loadData() {
  loading.value = true
  try {
    // 模型来源沿用「用户可用模型」，不暴露渠道；健康指标来自公开健康接口（失败降级为无指标）
    const [modelResp, healthResp] = await Promise.all([
      meApi.getAvailableModels({ limit: 1000 }),
      getPublicModelStatusMonitor({
        lookback_hours: 24,
        model_limit: 50,
        per_model_limit: 200,
      }).catch(() => null),
    ])
    models.value = (modelResp.models || []) as PublicGlobalModel[]
    const map = new Map<string, ModelStatusMonitor>()
    for (const monitor of healthResp?.models ?? []) {
      map.set(monitor.model, monitor)
    }
    metricsByModel.value = map
    nowMs.value = Date.now()
  } catch (err: unknown) {
    log.error('加载模型广场失败:', err)
    showError(parseApiError(err, ''), '加载模型广场失败')
  } finally {
    loading.value = false
  }
}

async function refreshData() {
  await loadData()
}

onMounted(() => {
  void refreshData()
})
</script>

