import { Network } from '@/network'

export interface FarmCrop {
  id: string
  name: string
  growSeconds: number
  price: number
  unlockCost: number
  stages: { seed: string; growing: string; ripe: string }
}

export interface FarmRules {
  startPlots: number
  maxPlots: number
  plotBaseCost: number
  plotCostGrowth: number
  fertilizerMaxLevel: number
  fertilizerBaseCost: number
  fertilizerCostGrowth: number
  fertilizerSpeedPerLevel: number
  offlineCapSeconds: number
  farmerStepSeconds: number
}

export interface FarmState {
  assets: {
    soil: string
    grass: string
    house: string
    hero: string
    coin: string
    seed: string
    farmerHoe: string
    farmerWater: string
    farmerWalk: string
  }
  crops: FarmCrop[]
  rules: FarmRules
  card: { coins: number; harvests: number; claimable: number }
}

interface FarmStateResponse {
  success?: boolean
  message?: string
  data?: FarmState
}

export async function fetchFarmState(): Promise<{ ok: true; data: FarmState } | { ok: false; message: string }> {
  try {
    const res = await Network.request({ url: '/api/farm/state', method: 'GET' })
    const body = res?.data as FarmStateResponse | null
    if (body?.success && body.data) {
      return { ok: true, data: body.data }
    }
    return { ok: false, message: body?.message || '农场配置读取失败' }
  } catch (error) {
    console.error('[farm] state failed', error)
    return { ok: false, message: '网络不太好，农场没打开' }
  }
}

export async function claimCardCoins(): Promise<number | null> {
  try {
    const res = await Network.request({ url: '/api/farm/claim', method: 'POST', data: {} })
    const body = res?.data as { success?: boolean; data?: { claimed?: number } } | null
    if (body?.success) {
      return body.data?.claimed ?? 0
    }
    return null
  } catch (error) {
    console.error('[farm] claim failed', error)
    return null
  }
}
