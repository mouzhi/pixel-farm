import { View, Text } from '@tarojs/components'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CustomNavSpace } from '@/components/custom-nav-space'
import { PixelImage } from '@/components/pixel-image'
import { claimCardCoins, fetchFarmState, type FarmCrop, type FarmState } from '@/lib/farm-api'
import {
  fertilizerCost,
  growMs,
  loadSave,
  newSave,
  plotCost,
  settleOffline,
  writeSave,
  type FarmSave,
} from '@/lib/farm-save'
import './index.css'

type Phase = 'loading' | 'ready' | 'error'
type FarmerMode = 'idle' | 'walk' | 'hoe'

interface Tip {
  id: number
  plot: number
  text: string
}

const COLS = 3

export default function Index() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorText, setErrorText] = useState('')
  const [farm, setFarm] = useState<FarmState | null>(null)
  const [save, setSave] = useState<FarmSave | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [active, setActive] = useState(true)
  const [offline, setOffline] = useState<{ earned: number; harvested: number } | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimedNote, setClaimedNote] = useState('')
  const [farmerPlot, setFarmerPlot] = useState(0)
  const [farmerMode, setFarmerMode] = useState<FarmerMode>('idle')
  const [facingLeft, setFacingLeft] = useState(false)
  const [tips, setTips] = useState<Tip[]>([])
  const [notice, setNotice] = useState('')
  const tipId = useRef(0)
  const saveRef = useRef<FarmSave | null>(null)
  const loadedRef = useRef(false)

  saveRef.current = save

  const load = useCallback(async () => {
    setPhase('loading')
    const res = await fetchFarmState()
    if (!res.ok) {
      setErrorText(res.message)
      setPhase('error')
      return
    }
    const current = Date.now()
    const existing = loadSave()
    let next: FarmSave
    if (existing) {
      const settled = settleOffline(existing, res.data.crops, res.data.rules, current)
      next = settled.save
      if (settled.earned > 0) setOffline({ earned: settled.earned, harvested: settled.harvested })
    } else {
      next = newSave(res.data.rules, current)
    }
    setFarm(res.data)
    setSave(next)
    writeSave(next)
    setNow(current)
    setPhase('ready')
  }, [])

  useDidShow(() => {
    setActive(true)
    if (!loadedRef.current) {
      loadedRef.current = true
      void load()
    } else {
      // 回到页面时刷新卡面带来的金币
      void fetchFarmState().then((res) => {
        if (res.ok) setFarm(res.data)
      })
    }
  })

  useDidHide(() => {
    setActive(false)
    const current = saveRef.current
    if (current) writeSave({ ...current, lastSeen: Date.now() })
  })

  // 定时写存档
  useEffect(() => {
    if (!save) return undefined
    const timer = setTimeout(() => writeSave({ ...save, lastSeen: Date.now() }), 800)
    return () => clearTimeout(timer)
  }, [save])

  useEffect(() => {
    if (!active || phase !== 'ready') return undefined
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [active, phase])

  const cropOf = useCallback(
    (id: string): FarmCrop | undefined => farm?.crops.find((crop) => crop.id === id) ?? farm?.crops[0],
    [farm],
  )

  const addTip = useCallback((plot: number, text: string) => {
    tipId.current += 1
    const id = tipId.current
    setTips((prev) => [...prev, { id, plot, text }])
    setTimeout(() => setTips((prev) => prev.filter((tip) => tip.id !== id)), 800)
  }, [])

  const flash = useCallback((text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((value) => (value === text ? '' : value)), 1600)
  }, [])

  const harvestPlot = useCallback(
    (index: number, byFarmer: boolean) => {
      const current = saveRef.current
      if (!farm || !current) return false
      const plot = current.plots[index]
      const crop = cropOf(plot.cropId)
      if (!crop) return false
      const ms = growMs(crop, current.fertilizer, farm.rules)
      const t = Date.now()
      if (t - plot.plantedAt < ms) return false
      setSave({
        ...current,
        coins: current.coins + crop.price,
        harvests: current.harvests + 1,
        plots: current.plots.map((p, i) => (i === index ? { cropId: current.selected, plantedAt: t } : p)),
      })
      addTip(index, `+${crop.price}`)
      setFacingLeft(index % COLS < farmerPlot % COLS)
      setFarmerPlot(index)
      setFarmerMode(byFarmer ? 'walk' : 'hoe')
      setTimeout(() => setFarmerMode('hoe'), 380)
      setTimeout(() => setFarmerMode('idle'), 1000)
      return true
    },
    [farm, cropOf, addTip, farmerPlot],
  )

  // 农夫自动巡田：每隔一会儿收一块成熟的地
  useEffect(() => {
    if (!active || phase !== 'ready' || !farm) return undefined
    const timer = setInterval(() => {
      const current = saveRef.current
      if (!current) return
      const t = Date.now()
      const ripe = current.plots.findIndex((plot) => {
        const crop = cropOf(plot.cropId)
        return crop ? t - plot.plantedAt >= growMs(crop, current.fertilizer, farm.rules) : false
      })
      if (ripe >= 0) harvestPlot(ripe, true)
    }, farm.rules.farmerStepSeconds * 1000)
    return () => clearInterval(timer)
  }, [active, phase, farm, cropOf, harvestPlot])

  const onPlotTap = (index: number) => {
    if (!harvestPlot(index, false)) {
      const current = saveRef.current
      const crop = current ? cropOf(current.plots[index].cropId) : undefined
      if (farm && current && crop) {
        const left = growMs(crop, current.fertilizer, farm.rules) - (Date.now() - current.plots[index].plantedAt)
        flash(`${crop.name}还要 ${Math.ceil(left / 1000)} 秒成熟`)
      }
    }
  }

  const onClaim = async () => {
    if (claiming) return
    setClaiming(true)
    const claimed = await claimCardCoins()
    setClaiming(false)
    if (claimed === null) {
      flash('没收成功，再点一次试试')
      return
    }
    const current = saveRef.current
    if (current && claimed > 0) setSave({ ...current, coins: current.coins + claimed })
    setClaimedNote(claimed > 0 ? `已把卡片里的 ${claimed} 金币收进农场` : '卡片金币已经收过啦')
    if (farm) setFarm({ ...farm, card: { ...farm.card, claimable: 0 } })
  }

  const buyPlot = () => {
    if (!farm || !save) return
    if (save.plots.length >= farm.rules.maxPlots) return
    const cost = plotCost(save.plots.length, farm.rules)
    if (save.coins < cost) {
      flash(`还差 ${cost - save.coins} 金币`)
      return
    }
    setSave({ ...save, coins: save.coins - cost, plots: [...save.plots, { cropId: save.selected, plantedAt: Date.now() }] })
    flash('新开了一块地')
  }

  const buyFertilizer = () => {
    if (!farm || !save) return
    if (save.fertilizer >= farm.rules.fertilizerMaxLevel) return
    const cost = fertilizerCost(save.fertilizer, farm.rules)
    if (save.coins < cost) {
      flash(`还差 ${cost - save.coins} 金币`)
      return
    }
    setSave({ ...save, coins: save.coins - cost, fertilizer: save.fertilizer + 1 })
    flash('施肥成功，长得更快了')
  }

  const pickCrop = (crop: FarmCrop) => {
    if (!save) return
    if (save.unlocked.includes(crop.id)) {
      setSave({ ...save, selected: crop.id })
      flash(`下一季种${crop.name}`)
      return
    }
    if (save.coins < crop.unlockCost) {
      flash(`解锁${crop.name}还差 ${crop.unlockCost - save.coins} 金币`)
      return
    }
    setSave({ ...save, coins: save.coins - crop.unlockCost, unlocked: [...save.unlocked, crop.id], selected: crop.id })
    flash(`解锁了${crop.name}`)
  }

  if (phase !== 'ready' || !farm || !save) {
    return (
      <View className="flex min-h-screen flex-col bg-[#2f4a1f]">
        <CustomNavSpace />
        <View className="flex flex-1 flex-col items-center justify-center px-8">
          <Text className="text-base text-[#fff3d6]">{phase === 'error' ? errorText : '农场开门中…'}</Text>
          {phase === 'error' ? (
            <View className="mt-4 rounded-full bg-[#ffd34d] px-6 py-2" onClick={() => void load()}>
              <Text className="text-sm font-semibold text-[#4a2a12]">重新打开</Text>
            </View>
          ) : null}
        </View>
      </View>
    )
  }

  const perMinute = Math.round(
    save.plots.reduce((sum, plot) => {
      const crop = cropOf(plot.cropId)
      return crop ? sum + (crop.price * 60000) / growMs(crop, save.fertilizer, farm.rules) : sum
    }, 0),
  )
  const rows = Math.ceil(Math.min(save.plots.length + 1, farm.rules.maxPlots) / COLS)
  const farmerStyle = {
    left: `${(((farmerPlot % COLS) + 0.5) / COLS) * 100}%`,
    top: `${((Math.floor(farmerPlot / COLS) + 0.15) / rows) * 100}%`,
  }
  const farmerSheet = farmerMode === 'walk' ? farm.assets.farmerWalk : farm.assets.farmerHoe
  const nextPlotCost = save.plots.length < farm.rules.maxPlots ? plotCost(save.plots.length, farm.rules) : 0
  const nextFertCost = save.fertilizer < farm.rules.fertilizerMaxLevel ? fertilizerCost(save.fertilizer, farm.rules) : 0
  const selectedCrop = cropOf(save.selected)

  return (
    <View className="flex min-h-screen flex-col bg-[#2f4a1f] pb-8">
      {/* 头图与导航避让属于同一视觉面 */}
      <View className="relative w-full">
        <PixelImage className="block h-60 w-full" src={farm.assets.hero} mode="aspectFill" />
        <View className="absolute left-0 right-0 top-0">
          <CustomNavSpace />
        </View>
        <View className="farm-hero-fade absolute bottom-0 left-0 right-0 flex flex-col px-5 pb-3 pt-10">
          <Text className="pixel-title text-3xl font-bold text-[#fff3d6]">像素小农场</Text>
          <Text className="mt-1 text-sm text-[#fff3d6]/80">放着也会自己长，回来就有金币收</Text>
        </View>
      </View>

      {/* HUD */}
      <View className="mx-4 -mt-1 flex flex-row items-center rounded-xl border-2 border-[#2e1c0e] bg-[#5c3a22] px-4 py-3">
        <PixelImage className="h-8 w-8 shrink-0" src={farm.assets.coin} />
        <Text className="pixel-coin ml-2 text-2xl font-bold text-[#ffd34d]">{String(save.coins)}</Text>
        <View className="ml-auto flex flex-col items-end">
          <Text className="text-xs text-[#ffecbe]/80">{`每分钟约 +${perMinute}`}</Text>
          <Text className="text-xs text-[#ffecbe]/80">{`施肥 ${save.fertilizer}/${farm.rules.fertilizerMaxLevel} 级 · 已收 ${save.harvests} 次`}</Text>
        </View>
      </View>

      {/* 卡面收获承接 */}
      <View className="mx-4 mt-3 flex flex-row items-center rounded-xl border border-[#ffd34d]/40 bg-[#1f3315] px-4 py-3">
        <PixelImage className="h-7 w-7 shrink-0" src={farm.assets.seed} />
        <View className="ml-3 flex min-w-0 flex-1 flex-col">
          <Text className="text-sm font-semibold text-[#fff3d6]">卡片里种的菜</Text>
          <Text className="text-xs text-[#fff3d6]/70">
            {claimedNote ||
              (farm.card.claimable > 0
                ? `在卡片上收获了 ${farm.card.harvests} 次，攒下 ${farm.card.claimable} 金币`
                : farm.card.coins > 0
                  ? `卡片累计带来 ${farm.card.coins} 金币，已全部收进农场`
                  : '在卡片上点地种菜，收获的金币会带到这里')}
          </Text>
        </View>
        {farm.card.claimable > 0 ? (
          <View className="ml-2 shrink-0 rounded-full bg-[#ffd34d] px-4 py-2" onClick={() => void onClaim()}>
            <Text className="text-sm font-semibold text-[#4a2a12]">{claiming ? '收取中…' : '收进农场'}</Text>
          </View>
        ) : null}
      </View>

      {/* 挂机农场 */}
      <View className="mx-4 mt-3 overflow-hidden rounded-xl border-2 border-[#2e1c0e]">
        <View className="farm-yard flex flex-col px-3 pb-4 pt-2" style={{ backgroundImage: `url(${farm.assets.grass})` }}>
          <View className="flex flex-row items-end">
            <PixelImage className="h-20 w-20 shrink-0" src={farm.assets.house} />
            <View className="mb-2 ml-2 flex min-w-0 flex-1 flex-col rounded-lg bg-[#1f3315]/80 px-3 py-2">
              <Text className="text-sm font-semibold text-[#fff3d6]">{`小农夫正在巡田`}</Text>
              <Text className="text-xs text-[#fff3d6]/75">
                {`熟了会自动收，下一季种${selectedCrop?.name ?? ''}；点成熟的地可以马上收`}
              </Text>
            </View>
          </View>
          <View className="relative mt-2 flex flex-col">
            {Array.from({ length: rows }, (_, r) => (
              <View key={`row-${r}`} className="mt-2 flex flex-row gap-2">
                {Array.from({ length: COLS }, (_, c) => {
                  const index = r * COLS + c
                  const plot = save.plots[index]
                  if (!plot) {
                    const isNext = index === save.plots.length && nextPlotCost > 0
                    return (
                      <View
                        key={`empty-${index}`}
                        className="relative flex aspect-square flex-1 flex-col items-center justify-center rounded-md border-2 border-dashed border-[#2e4a1a]/60 bg-[#2e4a1a]/25"
                        onClick={isNext ? buyPlot : undefined}
                      >
                        <Text className="text-2xl font-bold text-[#fff3d6]/70">{isNext ? '+' : '·'}</Text>
                        {isNext ? <Text className="text-xs text-[#fff3d6]/80">{`扩建 ${nextPlotCost}`}</Text> : null}
                      </View>
                    )
                  }
                  const crop = cropOf(plot.cropId)
                  if (!crop) return null
                  const ms = growMs(crop, save.fertilizer, farm.rules)
                  const progress = Math.min(1, (now - plot.plantedAt) / ms)
                  const ripe = progress >= 1
                  const stage = ripe ? crop.stages.ripe : progress < 0.45 ? crop.stages.seed : crop.stages.growing
                  return (
                    <View
                      key={`plot-${index}`}
                      className="relative flex aspect-square flex-1 items-center justify-center"
                      onClick={() => onPlotTap(index)}
                    >
                      {ripe ? <View className="plot-glow absolute inset-0 rounded-full" /> : null}
                      <PixelImage className="absolute inset-0 h-full w-full" src={farm.assets.soil} />
                      <PixelImage className={ripe ? 'plot-bob absolute left-[12%] top-[6%] h-[76%] w-[76%]' : 'absolute left-[12%] top-[6%] h-[76%] w-[76%]'} src={stage} />
                      {!ripe ? (
                        <View className="absolute bottom-2 left-1/4 right-1/4 h-1.5 overflow-hidden rounded-sm border border-[#2e1c0e] bg-[#1e1208]/75">
                          <View className="h-full bg-[#8fe04f]" style={{ width: `${Math.round(progress * 100)}%` }} />
                        </View>
                      ) : null}
                      {tips
                        .filter((tip) => tip.plot === index)
                        .map((tip) => (
                          <Text key={`tip-${tip.id}`} className="pixel-coin plot-tip absolute top-1 text-xl font-bold text-[#ffd34d]">
                            {tip.text}
                          </Text>
                        ))}
                    </View>
                  )
                })}
              </View>
            ))}
            <View className={facingLeft ? 'farmer farmer-left absolute' : 'farmer absolute'} style={farmerStyle}>
              <View className="farmer-frame">
                <PixelImage
                  key={`farmer-${farmerMode}`}
                  className={farmerMode === 'idle' ? 'farmer-sheet' : 'farmer-sheet farmer-anim'}
                  src={farmerSheet}
                  mode="scaleToFill"
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 作物 */}
      <Text className="mx-5 mt-5 text-base font-semibold text-[#fff3d6]">选下一季种什么</Text>
      <View className="mx-4 mt-2 flex flex-row gap-2">
        {farm.crops.map((crop) => {
          const owned = save.unlocked.includes(crop.id)
          const selected = save.selected === crop.id
          return (
            <View
              key={crop.id}
              className={`flex flex-1 flex-col items-center rounded-xl px-2 py-3 ${selected ? 'border-2 border-[#ffd34d] bg-[#7c4e28]' : 'border border-[#ffe2aa]/30 bg-[#5c3a22]'}`}
              onClick={() => pickCrop(crop)}
            >
              <PixelImage className="h-12 w-12" src={crop.stages.ripe} />
              <Text className="mt-1 text-sm font-semibold text-[#fff3d6]">{crop.name}</Text>
              <Text className="text-xs text-[#ffecbe]/80">
                {`${Math.round(growMs(crop, save.fertilizer, farm.rules) / 1000)}秒 · +${crop.price}`}
              </Text>
              <Text className={`mt-1 text-xs ${owned ? 'text-[#8fe04f]' : 'text-[#ffd34d]'}`}>
                {owned ? (selected ? '种植中' : '点击换种') : `解锁 ${crop.unlockCost}`}
              </Text>
            </View>
          )
        })}
      </View>

      {/* 升级 */}
      <Text className="mx-5 mt-5 text-base font-semibold text-[#fff3d6]">升级农场</Text>
      <View className="mx-4 mt-2 flex flex-row gap-2">
        <View className="flex flex-1 flex-col rounded-xl border border-[#ffe2aa]/30 bg-[#5c3a22] p-3" onClick={buyPlot}>
          <Text className="text-sm font-semibold text-[#fff3d6]">扩建田地</Text>
          <Text className="mt-1 text-xs text-[#ffecbe]/80">{`${save.plots.length}/${farm.rules.maxPlots} 块地`}</Text>
          <Text className="mt-2 text-sm font-semibold text-[#ffd34d]">{nextPlotCost ? `${nextPlotCost} 金币` : '已满'}</Text>
        </View>
        <View className="flex flex-1 flex-col rounded-xl border border-[#ffe2aa]/30 bg-[#5c3a22] p-3" onClick={buyFertilizer}>
          <Text className="text-sm font-semibold text-[#fff3d6]">施肥加速</Text>
          <Text className="mt-1 text-xs text-[#ffecbe]/80">{`每级生长快 15%`}</Text>
          <Text className="mt-2 text-sm font-semibold text-[#ffd34d]">{nextFertCost ? `${nextFertCost} 金币` : '已满级'}</Text>
        </View>
      </View>
      <Text className="mx-5 mt-4 text-xs text-[#fff3d6]/50">存档保存在这台手机上，离开后最多结算 8 小时的收成</Text>

      {notice ? (
        <View className="fixed bottom-10 left-0 right-0 flex flex-row justify-center">
          <View className="rounded-full bg-[#1e1208]/90 px-5 py-2">
            <Text className="text-sm text-[#fff3d6]">{notice}</Text>
          </View>
        </View>
      ) : null}

      {offline ? (
        <View className="fixed inset-0 flex flex-col items-center justify-center bg-black/55 px-10">
          <View className="flex w-full flex-col items-center rounded-2xl border-2 border-[#2e1c0e] bg-[#5c3a22] px-6 py-6">
            <PixelImage className="h-14 w-14" src={farm.assets.coin} />
            <Text className="mt-2 text-base font-semibold text-[#fff3d6]">你不在的时候</Text>
            <Text className="mt-1 text-sm text-[#ffecbe]/85">{`小农夫收了 ${offline.harvested} 次菜`}</Text>
            <Text className="pixel-coin mt-2 text-3xl font-bold text-[#ffd34d]">{`+${offline.earned}`}</Text>
            <View className="mt-4 rounded-full bg-[#ffd34d] px-8 py-2" onClick={() => setOffline(null)}>
              <Text className="text-sm font-semibold text-[#4a2a12]">收下</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
