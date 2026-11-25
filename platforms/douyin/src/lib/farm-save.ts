import Taro from '@tarojs/taro'
import type { FarmCrop, FarmRules } from './farm-api'

const SAVE_KEY = 'pixel-lite-farm-v1'

export interface PlotSave {
  cropId: string
  plantedAt: number
}

export interface FarmSave {
  v: 1
  coins: number
  plots: PlotSave[]
  fertilizer: number
  unlocked: string[]
  selected: string
  lastSeen: number
  harvests: number
}

export function newSave(rules: FarmRules, now: number): FarmSave {
  return {
    v: 1,
    coins: 0,
    plots: Array.from({ length: rules.startPlots }, (_, i) => ({ cropId: 'carrot', plantedAt: now - i * 3000 })),
    fertilizer: 0,
    unlocked: ['carrot'],
    selected: 'carrot',
    lastSeen: now,
    harvests: 0,
  }
}

export function loadSave(): FarmSave | null {
  try {
    const raw = Taro.getStorageSync(SAVE_KEY) as unknown
    const data = (typeof raw === 'string' && raw ? JSON.parse(raw) : raw) as FarmSave | null
    if (data && data.v === 1 && Array.isArray(data.plots)) {
      return data
    }
  } catch (error) {
    console.error('[farm] load save failed', error)
  }
  return null
}

export function writeSave(save: FarmSave): void {
  try {
    Taro.setStorageSync(SAVE_KEY, JSON.stringify(save))
  } catch (error) {
    console.error('[farm] write save failed', error)
  }
}

export function growMs(crop: FarmCrop, fertilizer: number, rules: FarmRules): number {
  return (crop.growSeconds * 1000) / (1 + fertilizer * rules.fertilizerSpeedPerLevel)
}

/** 离线结算：每块地按经过的时间自动收获、自动补种 */
export function settleOffline(
  save: FarmSave,
  crops: FarmCrop[],
  rules: FarmRules,
  now: number,
): { save: FarmSave; earned: number; harvested: number } {
  const elapsed = Math.max(0, now - save.lastSeen)
  const capMs = rules.offlineCapSeconds * 1000
  let earned = 0
  let harvested = 0
  const plots = save.plots.map((plot) => {
    const crop = crops.find((c) => c.id === plot.cropId) ?? crops[0]
    const ms = growMs(crop, save.fertilizer, rules)
    const since = now - plot.plantedAt
    if (since < ms) return plot
    // 只结算离开期间（且不超过上限）的收获，在线时成熟未收的留给农夫
    const offlineSince = Math.min(since, elapsed, capMs)
    const cycles = Math.floor(offlineSince / ms)
    if (cycles <= 0) return plot
    earned += cycles * crop.price
    harvested += cycles
    return { cropId: save.selected, plantedAt: now - ((since - cycles * ms) % ms) }
  })
  return { save: { ...save, plots, coins: save.coins + earned, harvests: save.harvests + harvested, lastSeen: now }, earned, harvested }
}

export function plotCost(count: number, rules: FarmRules): number {
  return Math.round(rules.plotBaseCost * Math.pow(rules.plotCostGrowth, count - rules.startPlots))
}

export function fertilizerCost(level: number, rules: FarmRules): number {
  return Math.round(rules.fertilizerBaseCost * Math.pow(rules.fertilizerCostGrowth, level))
}
