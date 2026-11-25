import { Network } from '@/network'
import type { CardData, DyCardApiResponse } from '../../card-data/types'

/** 平台 Card onLoad(query, data) 第二参；字段名与基础库一致（含 userInitialData 拼写） */
export type OpenCardLoadData = {
  stateData?: unknown
  userInitialData?: unknown
}

function parseCardDataPayload(raw: unknown): CardData | null {
  if (raw == null) {
    return null
  }

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('[card-data] failed to parse CardData JSON string')
      return null
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const record = parsed as Record<string, unknown>
  if (typeof record.contractVersion === 'string' && record.views && typeof record.views === 'object') {
    return parsed as CardData
  }

  return null
}

/**
 * 从 Card onLoad(query, data) 提取 loadData。
 * 优先使用第二参 data；部分运行时可能把字段挂在 query 上。
 */
export function extractOpenCardLoadData(
  query?: Record<string, unknown>,
  data?: OpenCardLoadData,
): OpenCardLoadData | undefined {
  if (data?.stateData !== undefined || data?.userInitialData !== undefined) {
    return data
  }

  if (query?.stateData !== undefined || query?.userInitialData !== undefined) {
    return {
      stateData: query.stateData,
      userInitialData: query.userInitialData,
    }
  }

  return undefined
}

/**
 * 按平台优先级解析 CardData：stateData → userInitialData（均来自 onLoad data）。
 * 不含网络请求。
 */
export function resolveCardDataFromLoadData(loadData?: OpenCardLoadData): CardData | null {
  if (!loadData) {
    return null
  }

  const fromState = parseCardDataPayload(loadData.stateData)
  if (fromState) {
    return fromState
  }

  return parseCardDataPayload(loadData.userInitialData)
}

/**
 * 平台 Feed / OpenCard 网络读接口封装（优先级最低）。
 * 所有卡片可见业务数据最终须符合 CardDataModel；无本地数据时再请求此接口。
 */
export async function fetchCardData(taro: openCardTaro): Promise<CardData | null> {
  try {
    const res = await Network.request<DyCardApiResponse>(taro, {
      url: '/api/dy_card/data',
      method: 'GET',
    })

    const body = res?.data as DyCardApiResponse | null
    if (!body?.success || typeof body.data !== 'string') {
      return null
    }

    return parseCardDataPayload(body.data)
  } catch (error) {
    console.error('[fetchCardData] request failed', error)
    return null
  }
}

/**
 * Card 渲染数据统一入口：stateData → userInitialData → network（/api/dy_card/data）。
 */
export async function resolveCardData(
  taro: openCardTaro,
  loadData?: OpenCardLoadData,
): Promise<CardData | null> {
  const fromLoad = resolveCardDataFromLoadData(loadData)
  if (fromLoad) {
    return fromLoad
  }

  return fetchCardData(taro)
}

export type * from '../../card-data/types'
