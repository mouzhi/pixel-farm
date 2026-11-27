import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLoad, useCardTaro, useDidHide, useDidShow } from "@tarojs/taro";
import {
  extractOpenCardLoadData,
  fetchCardData,
  resolveCardData,
  type CardData,
  type FarmViewPayload,
  type OpenCardLoadData,
} from "@/services/card-data";
import { PixelImage } from "@/components/pixel-image";
import {
  COOP_PROPS,
  HOUSE_PROPS,
  PLOTS,
  SCARECROW,
  SHOP_SPOTS,
  SPOTS,
  actorBox,
  cropBox,
  propBox,
  type PropSpot,
} from "@/services/farm-layout";
import {
  COOP_EVERY_MS,
  COOP_GOLD,
  HELPER_EVERY_MS,
  HELPER_PICKS,
  SHOP,
  STORE_KEY,
  affordableCount,
  clockOf,
  costOf,
  cropCount,
  growMs,
  nextEffect,
  offlineRate,
  openCols,
  plotOpen,
  cropOfRow,
  cropOfPlot,
  dayNumber,
  formatAway,
  formatCoins,
  freshSave,
  offlineGain,
  parseSave,
  stageOf,
  type FarmSave,
  type OfflineGain,
  type ShopId,
  type ShopItem,
} from "@/services/farm-model";
import "./index.css";

type Phase = "loading" | "ready" | "error";
type FarmerMode = "idle" | "walk" | "work";
type HelperMode = "idle" | "walk" | "pick" | "water";

type TipKind = "small" | "big" | "note";

interface FloatTip {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: TipKind;
}

interface Bought {
  id: ShopId;
  level: number;
}

/** 商店格子图标从哪张图里取（位置见 index.css .icon-img-*） */
const ICON_ART: Record<ShopId, "crops" | "family" | "scene" | "props"> = {
  land: "crops",
  helper: "family",
  seed: "crops",
  well: "scene",
  coop: "props",
  house: "scene",
};

/** 主角帧：待机 0、走 1-2、挥锄 3-4；阿禾 5 */
const HELPER_FRAME = 5;

export default function IndexPage() {
  const taroRef = useRef<openCardTaro>();
  const mountedRef = useRef(true);
  const bootstrappedRef = useRef(false);
  const loadDataRef = useRef<OpenCardLoadData>();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tipIdRef = useRef(0);
  const saveRef = useRef<FarmSave | null>(null);
  const startedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [farm, setFarm] = useState<FarmViewPayload | null>(null);
  const [save, setSave] = useState<FarmSave | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(true);
  const [away, setAway] = useState<OfflineGain | null>(null);
  // 开始页：玩家点第一下之前，农场不走钟、不自动收菜、不下蛋、不弹离线收益
  const [started, setStarted] = useState(false);
  const [plantedIdx, setPlantedIdx] = useState(-1);
  const [picking, setPicking] = useState<number[]>([]);
  const [farmerMode, setFarmerMode] = useState<FarmerMode>("idle");
  const [farmerAtWork, setFarmerAtWork] = useState(false);
  const [helperPlot, setHelperPlot] = useState(-1);
  const [helperMode, setHelperMode] = useState<HelperMode>("idle");
  const [tips, setTips] = useState<FloatTip[]>([]);
  const [coinPop, setCoinPop] = useState(0);
  const [ctaShake, setCtaShake] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [bought, setBought] = useState<Bought | null>(null);
  const [deny, setDeny] = useState<{ id: ShopId; n: number } | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const persist = useCallback((next: FarmSave) => {
    const taro = taroRef.current;
    if (!taro) return;
    try {
      taro.setStorageSync(STORE_KEY, JSON.stringify({ ...next, lastAt: Date.now() }));
    } catch (error) {
      console.error("[farm] save failed", error);
    }
  }, []);

  const updateSave = useCallback(
    (fn: (prev: FarmSave) => FarmSave) => {
      setSave((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        saveRef.current = next;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const applyCardData = useCallback((data: CardData | null) => {
    if (!mountedRef.current) return;
    if (!data || data.displayMode !== "farm" || !data.views?.farm) {
      setPhase("error");
      return;
    }
    const view = data.views.farm;
    const current = Date.now();
    let stored: FarmSave | null = null;
    try {
      stored = parseSave(taroRef.current?.getStorageSync(STORE_KEY));
    } catch {
      stored = null;
    }
    const next = stored ?? freshSave(view.crops, current);
    const rate = stored ? offlineRate(view.offlinePerMinute, view.offlineCapHours, stored.lv) : null;
    setAway(stored && rate ? offlineGain(stored.lastAt, current, rate.perMinute, rate.capHours) : null);
    saveRef.current = next;
    setSave(next);
    setFarm(view);
    setNow(current);
    setPhase("ready");
    // 老存档先不写（lastAt 不动，离线收益留到点了开始之后再给）；新存档要写，免得下次进来又当新人
    if (!stored) persist(next);
  }, [persist]);

  const bootstrapCardData = useCallback(async () => {
    const taro = taroRef.current;
    if (!taro) return;
    applyCardData(await resolveCardData(taro, loadDataRef.current));
  }, [applyCardData]);

  const tryBootstrapCardData = useCallback(() => {
    if (bootstrappedRef.current || !taroRef.current) return;
    bootstrappedRef.current = true;
    void bootstrapCardData();
  }, [bootstrapCardData]);

  const retry = useCallback(async () => {
    const taro = taroRef.current;
    if (!taro) return;
    setPhase("loading");
    applyCardData(await fetchCardData(taro));
  }, [applyCardData]);

  useLoad((...args: unknown[]) => {
    const query = args[0] as Record<string, unknown> | undefined;
    const data = args[1] as OpenCardLoadData | undefined;
    loadDataRef.current = extractOpenCardLoadData(query, data);
    tryBootstrapCardData();
  });

  useCardTaro((taro) => {
    taroRef.current = taro;
    tryBootstrapCardData();
  });

  useDidShow(() => setVisible(true));
  useDidHide(() => {
    setVisible(false);
    if (saveRef.current && startedRef.current) persist(saveRef.current);
  });

  // 只在卡片可见时走钟；每秒一次足够驱动作物阶段
  useEffect(() => {
    if (!visible || phase !== "ready" || !started) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, phase, started]);


  const addTip = useCallback(
    (x: number, y: number, text: string, kind: TipKind) => {
      tipIdRef.current += 1;
      const id = tipIdRef.current;
      setTips((prev) => [...prev.slice(-4), { id, x, y, text, kind }]);
      later(() => setTips((prev) => prev.filter((tip) => tip.id !== id)), kind === "note" ? 1800 : 1000);
    },
    [later],
  );

  // 开始页：选一种种子，真的种到田里（挑一块长得最慢的地；全熟了就先收掉最后一块再种），然后农场才开始走
  const chooseSeed = useCallback(
    (cropIdx: number) => {
      const s = saveRef.current;
      if (!farm || !s || startedRef.current) return;
      const crop = farm.crops[cropIdx];
      if (!crop) return;
      const current = Date.now();
      let target = -1;
      let best = 2;
      let lastRipe = -1;
      PLOTS.forEach((spot, i) => {
        if (!plotOpen(spot.col, s.lv)) return;
        const c = cropOfPlot(farm.crops, i, s);
        const frac = c ? (current - s.plantedAt[i]) / growMs(c, s.lv) : 0;
        if (frac < 1) {
          if (frac < best) {
            best = frac;
            target = i;
          }
        } else {
          lastRipe = i;
        }
      });
      let gold = 0;
      if (target < 0) {
        target = lastRipe;
        if (target < 0) return;
        gold = cropOfPlot(farm.crops, target, s)?.price ?? 0;
      }
      startedRef.current = true;
      const slot = target;
      updateSave((prev) => {
        const pc = (prev.plotCrop ?? PLOTS.map(() => -1)).slice();
        pc[slot] = cropIdx;
        return {
          ...prev,
          coins: prev.coins + gold,
          harvests: prev.harvests + (gold > 0 ? 1 : 0),
          plantedAt: prev.plantedAt.map((t, i) => (i === slot ? current : t)),
          plotCrop: pc,
        };
      });
      setNow(current);
      setStarted(true);
      setPlantedIdx(slot);
      later(() => setPlantedIdx(-1), 1600);
      if (gold > 0) {
        setCoinPop((v) => v + 1);
        addTip(PLOTS[slot].x, PLOTS[slot].y - 4, `+${formatCoins(gold)}`, "small");
      }
      addTip(PLOTS[slot].x, PLOTS[slot].y - 12, `种下了${crop.name}`, "note");
    },
    [farm, later, updateSave, addTip],
  );

  const clock = clockOf(new Date(now));
  const isNight = clock.light === "night";

  const ripeList: number[] = [];
  let nextRipeMs = Infinity;
  if (farm && save) {
    PLOTS.forEach((spot, i) => {
      if (!plotOpen(spot.col, save.lv)) return;
      const crop = cropOfPlot(farm.crops, i, save);
      if (!crop) return;
      const left = growMs(crop, save.lv) - (now - save.plantedAt[i]);
      if (left <= 0) ripeList.push(i);
      else nextRipeMs = Math.min(nextRipeMs, left);
    });
  }
  const ripeCount = ripeList.length;

  const harvestAll = useCallback(() => {
    if (!farm || !saveRef.current) return;
    const current = Date.now();
    const s = saveRef.current;
    const ripe: number[] = [];
    let gold = 0;
    PLOTS.forEach((spot, i) => {
      if (!plotOpen(spot.col, s.lv)) return;
      const crop = cropOfPlot(farm.crops, i, s);
      if (crop && current - s.plantedAt[i] >= growMs(crop, s.lv)) {
        ripe.push(i);
        gold += crop.price;
      }
    });
    setNow(current);
    if (!ripe.length) {
      setCtaShake((v) => v + 1);
      return;
    }
    setPicking(ripe);
    later(() => setPicking([]), 1100);
    updateSave((prev) => ({
      ...prev,
      coins: prev.coins + gold,
      harvests: prev.harvests + ripe.length,
      plantedAt: prev.plantedAt.map((t, i) => (ripe.includes(i) ? current : t)),
      plotCrop: prev.plotCrop?.map((c, i) => (ripe.includes(i) ? -1 : c)),
    }));
    setCoinPop((v) => v + 1);
    addTip(SPOTS.ripeBubble.x, SPOTS.ripeBubble.y + 4, `+${formatCoins(gold)}`, "big");
    setFarmerAtWork(true);
    setFarmerMode("walk");
    later(() => setFarmerMode("work"), 380);
    later(() => setFarmerMode("idle"), 1700);
  }, [farm, later, updateSave, addTip]);

  // 阿禾挂机（雇来之后）：白天每隔几秒去收熟了的菜，没有熟的就去浇水；夜里回屋睡觉
  const helperLv = save?.lv.helper ?? 0;
  useEffect(() => {
    if (!visible || phase !== "ready" || !started || !farm || isNight || helperLv <= 0) {
      setHelperPlot(-1);
      setHelperMode("idle");
      return undefined;
    }
    const every = HELPER_EVERY_MS[helperLv];
    const timer = setInterval(() => {
      const s = saveRef.current;
      if (!s) return;
      const current = Date.now();
      const ripe: number[] = [];
      const open: number[] = [];
      PLOTS.forEach((spot, i) => {
        if (!plotOpen(spot.col, s.lv)) return;
        open.push(i);
        const crop = cropOfPlot(farm.crops, i, s);
        if (crop && current - s.plantedAt[i] >= growMs(crop, s.lv)) ripe.push(i);
      });
      // 留几块给你亲手收：熟的不到 4 块时她只浇水
      const willPick = ripe.length > 3;
      const picks = willPick ? ripe.slice(-HELPER_PICKS[helperLv]) : [];
      const target = willPick ? picks[0] : open[Math.floor((current / 4300) % Math.max(1, open.length))];
      if (target === undefined) return;
      setHelperPlot(target);
      setHelperMode("walk");
      later(() => {
        setHelperMode(willPick ? "pick" : "water");
        if (!willPick) return;
        let gold = 0;
        picks.forEach((i) => {
          gold += cropOfPlot(farm.crops, i, s)?.price ?? 0;
        });
        updateSave((prev) => ({
          ...prev,
          coins: prev.coins + gold,
          harvests: prev.harvests + picks.length,
          plantedAt: prev.plantedAt.map((t, i) => (picks.includes(i) ? Date.now() : t)),
          plotCrop: prev.plotCrop?.map((c, i) => (picks.includes(i) ? -1 : c)),
        }));
        setCoinPop((v) => v + 1);
        addTip(PLOTS[target].x + 2, PLOTS[target].y - 9, `+${gold}`, "small");
      }, Math.min(1000, every * 0.3));
      later(() => setHelperMode("idle"), Math.min(2600, every - 300));
    }, every);
    return () => clearInterval(timer);
  }, [visible, phase, started, farm, isNight, helperLv, later, updateSave, addTip]);

  // 鸡舍：小动物每 10 秒下蛋换一点钱（卡片可见时）
  const coopLv = save?.lv.coop ?? 0;
  useEffect(() => {
    if (!visible || phase !== "ready" || !started || coopLv <= 0) return undefined;
    const timer = setInterval(() => {
      const gold = COOP_GOLD[coopLv];
      updateSave((prev) => ({ ...prev, coins: prev.coins + gold }));
      setCoinPop((v) => v + 1);
      addTip(SHOP_SPOTS.coop.x, SHOP_SPOTS.coop.y, `+${gold}`, "small");
    }, COOP_EVERY_MS);
    return () => clearInterval(timer);
  }, [visible, phase, started, coopLv, updateSave, addTip]);

  const buy = useCallback(
    (item: ShopItem) => {
      const s = saveRef.current;
      if (!farm || !s) return;
      const level = s.lv[item.id];
      const cost = costOf(item, level);
      if (cost === null) return;
      if (s.coins < cost) {
        setDeny({ id: item.id, n: Date.now() });
        return;
      }
      const current = Date.now();
      const newCol = openCols(s.lv);
      updateSave((prev) => ({
        ...prev,
        coins: prev.coins - cost,
        lv: { ...prev.lv, [item.id]: prev.lv[item.id] + 1 },
        // 新开的一列从种子长起
        plantedAt: item.id === "land" ? prev.plantedAt.map((t, i) => (PLOTS[i].col === newCol ? current : t)) : prev.plantedAt,
      }));
      const nextLv = { ...s.lv, [item.id]: level + 1 };
      const crop = farm.crops[cropCount(nextLv) - 1];
      const note: Record<ShopId, string> = {
        land: `田多了 4 块`,
        helper: level === 0 ? `${farm.helperName}来帮忙了` : `${farm.helperName}更勤快了`,
        seed: `种上${crop?.name ?? "新菜"}了`,
        well: "浇得勤，长得快",
        coop: level === 0 ? "两只鸡住进来了" : level === 1 ? "又来两只鸡" : "小猪来了",
        house: "主屋更舒服了",
      };
      setShopOpen(false);
      setDeny(null);
      setBought({ id: item.id, level: level + 1 });
      later(() => setBought(null), 2400);
      setCoinPop((v) => v + 1);
      addTip(SHOP_SPOTS[item.id].x, SHOP_SPOTS[item.id].y, note[item.id], "note");
    },
    [farm, later, updateSave, addTip],
  );

  const collectAway = useCallback(() => {
    if (!away) return;
    const gain = away.coins;
    setAway(null);
    updateSave((prev) => ({ ...prev, coins: prev.coins + gain }));
    setCoinPop((v) => v + 1);
    addTip(50, 30, `+${formatCoins(gain)}`, "big");
  }, [away, updateSave, addTip]);

  if (phase !== "ready" || !farm || !save) {
    return (
      <View className="widget-root farm-card">
        <View className="widget-body widget-adaptive">
          {phase === "loading" ? <Text className="widget-state-message">农场开门中…</Text> : null}
          {phase === "error" ? (
            <View className="farm-error">
              <Text className="widget-state-message">农场暂时打不开</Text>
              <View className="farm-retry" ariaLabel="重试" onClick={() => void retry()}>
                <Text className="farm-retry-text">重试</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const art = (pair: { day: string; night: string }) => (isNight ? pair.night : pair.day);
  const lv = save.lv;
  const hasHelper = lv.helper > 0;
  const affordable = affordableCount(save);
  const farmerSpot = isNight ? SPOTS.farmerNight : farmerAtWork ? SPOTS.farmerWork : SPOTS.farmerIdle;
  const helperSpot =
    helperPlot >= 0 ? { x: PLOTS[helperPlot].x - 4, y: PLOTS[helperPlot].y + 1 } : SPOTS.helperIdle;
  const helperBubble =
    helperMode === "walk" ? "去田里" : helperMode === "pick" ? "收菜！" : helperMode === "water" ? "浇浇水" : "";
  const nextSecs = Number.isFinite(nextRipeMs) ? Math.ceil(nextRipeMs / 1000) : 0;
  const statusText =
    !started ? "选一种种子，看看种出什么" : ripeCount > 0 ? `地里 ${ripeCount} 块熟了` : affordable > 0 ? "钱够了，去小店升级" : `下一茬 ${nextSecs} 秒后熟`;
  const helperText = !started
    ? "种下之后，农场才开始动"
    : !hasHelper
    ? `已收 ${save.harvests} 筐 · 小店能雇${farm.helperName}`
    : isNight
      ? `${farm.helperName}睡了 · ${farm.copy.nightHint}`
      : `${farm.helperName}在帮你种地 · 已收 ${save.harvests} 筐`;
  const iconArt = { crops: farm.cropAtlas, family: farm.familySheet, scene: farm.scene, props: farm.propSheet };
  const newCrop = bought?.id === "seed" ? farm.crops[cropCount(lv) - 1]?.id : undefined;

  // 小商店买到的东西：小动物、门前装饰、田扩满后的稻草人
  const props: { spot: PropSpot; fresh: boolean; animal: boolean }[] = [];
  COOP_PROPS.forEach((group, level) => {
    if (level > 0 && level <= lv.coop)
      group.forEach((spot) => props.push({ spot, fresh: bought?.id === "coop" && bought.level === level, animal: true }));
  });
  HOUSE_PROPS.forEach((group, level) => {
    if (level > 0 && level <= lv.house)
      group.forEach((spot) => props.push({ spot, fresh: bought?.id === "house" && bought.level === level, animal: false }));
  });
  if (openCols(lv) >= 6) props.push({ spot: SCARECROW, fresh: bought?.id === "land", animal: false });
  props.sort((p, q) => p.spot.y - q.spot.y);

  return (
    <View className={`widget-root farm-card is-${clock.light}`}>
      <View className="widget-header farm-hud">
        <View className="hud-clock">
          <Text className="hud-day">{`第 ${dayNumber(save.firstAt, now)} 天`}</Text>
          <Text className="hud-time">{`${clock.hhmm} ${clock.phase}`}</Text>
        </View>
        <View className="hud-coins">
          <PixelImage key={`coin-${coinPop}`} className={coinPop > 0 ? "hud-coin-icon is-pop" : "hud-coin-icon"} src={farm.coinIcon} />
          <Text className="hud-coin-value">{formatCoins(save.coins)}</Text>
        </View>
      </View>

      <View className="widget-body farm-body" __lynx_timing_flag="__lynx_timing_actual_fmp">
        <View className="farm-stage">
          <PixelImage className="stage-scene" src={art(farm.scene)} mode="scaleToFill" ariaLabel="我的农场" />
          {clock.light === "dusk" ? <View className="stage-dusk" /> : null}

          {lv.house > 0 ? (
            <View className="chimney-smoke">
              <View className="smoke-puff puff-1" />
              <View className="smoke-puff puff-2" />
              {lv.house >= 2 ? <View className="smoke-puff puff-3" /> : null}
            </View>
          ) : null}

          {PLOTS.map((spot, i) => {
            if (!plotOpen(spot.col, lv)) return null;
            const crop = cropOfPlot(farm.crops, i, save);
            const picked = picking.includes(i);
            const stage = stageOf(crop, save.plantedAt[i], now, lv);
            const box = cropBox(spot);
            const cropIndex = Math.max(0, farm.crops.findIndex((c) => c.id === crop?.id));
            const fresh =
              (bought?.id === "land" && spot.col === openCols(lv) - 1) || (newCrop !== undefined && crop?.id === newCrop) || plantedIdx === i;
            const cls = `plot plot-r${spot.row}${stage === 3 ? " is-ripe" : ""}${fresh ? ` is-new wave-c${spot.col}` : ""}`;
            const plot = (
              <View key={`plot-${i}`} className={cls} style={{ left: box.left, top: box.top }}>
                <PixelImage
                  className="plot-atlas"
                  src={art(farm.cropAtlas)}
                  mode="scaleToFill"
                  style={{ left: `-${stage * 100}%`, top: `-${cropIndex * 100}%` }}
                />
              </View>
            );
            if (!picked) return plot;
            // 收菜：土留在原地重新播种，熟了的菜（图集第 5 列，不带土）往上飞走
            return [
              plot,
              <View key={`pick-${i}`} className={`plot plot-r${spot.row} is-picked wave-c${spot.col}`} style={{ left: box.left, top: box.top }}>
                <PixelImage
                  className="plot-atlas"
                  src={art(farm.cropAtlas)}
                  mode="scaleToFill"
                  style={{ left: "-400%", top: `-${cropIndex * 100}%` }}
                />
              </View>,
            ];
          })}

          {lv.well > 0 && !isNight ? (
            <View className={bought?.id === "well" ? "well-rain is-new" : "well-rain"}>
              {[1, 2, 3, 4, 5, 6].slice(0, lv.well * 2).map((n) => (
                <View key={`drop-${n}`} className={`rain-drop drop-${n}`} />
              ))}
            </View>
          ) : null}

          {props.map(({ spot, fresh, animal }) => (
            <View
              key={`prop-${spot.kind}-${spot.x}`}
              className={`prop${fresh ? " is-new" : ""}${animal ? " is-animal" : ""}`}
              style={propBox(spot)}
            >
              <View className={spot.flip ? "prop-frame is-flip" : "prop-frame"}>
                <PixelImage className={`prop-sheet prop-${spot.kind}`} src={art(farm.propSheet)} mode="scaleToFill" />
              </View>
            </View>
          ))}

          <View
            className="field-hit"
            ariaLabel={ripeCount > 0 ? `收获${ripeCount}块熟了的菜` : "田地"}
            onClick={harvestAll}
          />

          {started && ripeCount > 0 && picking.length === 0 ? (
            <View className="ripe-bubble" onClick={harvestAll}>
              <Text className="ripe-bubble-text">{`熟了 ${ripeCount} 块`}</Text>
            </View>
          ) : null}

          {isNight ? (
            <View className="sleep-bubble">
              <Text className="sleep-text">Zz</Text>
            </View>
          ) : hasHelper ? (
            <View
              className={bought?.id === "helper" && bought.level === 1 ? "actor actor-helper is-new" : "actor actor-helper"}
              style={actorBox(helperSpot.x, helperSpot.y)}
            >
              <View className="actor-frame">
                <PixelImage className={`actor-sheet frame-${HELPER_FRAME}${helperMode === "walk" ? " is-hop" : ""}`} src={art(farm.familySheet)} mode="scaleToFill" />
              </View>
              {helperBubble ? (
                <View className="actor-bubble">
                  <Text className="actor-bubble-text">{helperBubble}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="actor actor-farmer" style={actorBox(farmerSpot.x, farmerSpot.y)}>
            <View className="actor-frame">
              <PixelImage
                key={`farmer-${farmerMode}`}
                className={`actor-sheet frame-0${farmerMode === "walk" ? " is-walk" : farmerMode === "work" ? " is-work" : ""}`}
                src={art(farm.familySheet)}
                mode="scaleToFill"
              />
            </View>
          </View>

          {tips.map((tip) =>
            tip.kind === "note" ? (
              <View key={`tip-${tip.id}`} className="stage-note" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
                <Text className="stage-note-text">{tip.text}</Text>
              </View>
            ) : (
              <Text key={`tip-${tip.id}`} className={`stage-tip is-${tip.kind}`} style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
                {tip.text}
              </Text>
            ),
          )}

          {away && started ? (
            <View className="away-panel">
              <View className="away-text">
                <Text className="away-title">{`你离开了 ${formatAway(away.minutes)}`}</Text>
                <Text className="away-sub">
                  {hasHelper ? `${farm.helperName}帮你收了 ${away.baskets} 筐菜` : `地里攒下了 ${away.baskets} 筐菜`}
                </Text>
              </View>
              <Text className="away-gold">{`+${formatCoins(away.coins)}`}</Text>
              <View className="away-btn" ariaLabel={farm.copy.collect} onClick={collectAway}>
                <Text className="away-btn-text">{farm.copy.collect}</Text>
              </View>
            </View>
          ) : null}

          {shopOpen ? (
            <View className="shop-panel">
              <View className="shop-head">
                <Text className="shop-title">小商店</Text>
                <Text className="shop-hint">挂机攒钱，买了农场就变样</Text>
                <View className="shop-close" ariaLabel="关上小商店" onClick={() => setShopOpen(false)}>
                  <Text className="shop-close-text">×</Text>
                </View>
              </View>
              {[0, 1, 2].map((row) => (
                <View key={`shop-row-${row}`} className="shop-row">
                  {SHOP.slice(row * 2, row * 2 + 2).map((item) => {
                    const level = lv[item.id];
                    const cost = costOf(item, level);
                    const can = cost !== null && save.coins >= cost;
                    const short = deny?.id === item.id && cost !== null && !can;
                    const iconCls =
                      item.id === "seed" ? `icon-img-seed-${Math.min(3, cropCount(lv))}` : `icon-img-${item.id}`;
                    return (
                      <View
                        key={`shop-${item.id}`}
                        className={`shop-item${can ? " is-afford" : ""}${cost === null ? " is-max" : ""}`}
                        ariaLabel={`${item.name} ${cost === null ? "满级" : `${cost} 金币`}`}
                        onClick={() => buy(item)}
                      >
                        <View className="shop-icon">
                          <PixelImage className={`shop-icon-img ${iconCls}`} src={art(iconArt[ICON_ART[item.id]])} mode="scaleToFill" />
                        </View>
                        <View className="shop-info">
                          <View className="shop-name-row">
                            <Text className="shop-name">{item.name}</Text>
                            <Text className="shop-lv">{`Lv${level}`}</Text>
                          </View>
                          <Text className="shop-effect">
                            {nextEffect(item.id, lv, farm.crops, farm.helperName, farm.offlinePerMinute)}
                          </Text>
                          <View
                            key={`cost-${item.id}-${short ? deny?.n : 0}`}
                            className={`shop-cost${can ? " is-afford" : ""}${short ? " is-shake" : ""}`}
                          >
                            {cost === null ? null : <PixelImage className="shop-cost-coin" src={farm.coinIcon} />}
                            <Text className={can ? "shop-cost-text is-afford" : "shop-cost-text"}>
                              {cost === null ? "满级" : short ? `差 ${formatCoins(cost - save.coins)}` : formatCoins(cost)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View className="widget-footer farm-foot">
        <View className="foot-status">
          <Text className={affordable > 0 && ripeCount === 0 ? "foot-main is-afford" : "foot-main"}>{statusText}</Text>
          <Text className="foot-sub">{helperText}</Text>
        </View>
        <View
          className={`foot-shop${affordable > 0 ? " is-afford" : ""}${shopOpen ? " is-open" : ""}`}
          ariaLabel={affordable > 0 ? `小商店，有 ${affordable} 样买得起` : "小商店"}
          onClick={() => setShopOpen((v) => !v)}
        >
          <Text className={affordable > 0 ? "foot-shop-text is-afford" : "foot-shop-text"}>小店</Text>
          {affordable > 0 && !shopOpen ? (
            <View className="foot-shop-badge">
              <Text className="foot-shop-badge-text">{`可买${affordable}`}</Text>
            </View>
          ) : null}
        </View>
        <View
          key={`cta-${ctaShake}`}
          className={`foot-cta${ripeCount > 0 ? " is-ready" : ""}${ctaShake > 0 && ripeCount === 0 ? " is-shake" : ""}`}
          ariaLabel={ripeCount > 0 ? farm.copy.ripeCta : farm.copy.waitCta}
          onClick={harvestAll}
        >
          <Text className={ripeCount > 0 ? "foot-cta-text is-ready" : "foot-cta-text"}>
            {ripeCount > 0 ? farm.copy.ripeCta : farm.copy.waitCta}
          </Text>
        </View>
      </View>
      {!started ? (
        <View className="farm-gate">
          <Text className="farm-gate-title">选一种种子，看看种出什么</Text>
          <View className="farm-gate-seeds">
            {farm.crops.slice(0, 3).map((crop, idx) => (
              <View key={`seed-${crop.id}`} className="seed-btn" ariaLabel={`种${crop.name}`} onClick={() => chooseSeed(idx)}>
                <View className="seed-icon">
                  <PixelImage className="plot-atlas" src={art(farm.cropAtlas)} mode="scaleToFill" style={{ left: "-400%", top: `-${idx * 100}%` }} />
                </View>
                <Text className="seed-name">{crop.name}</Text>
                <Text className="seed-meta">{`${Math.round(growMs(crop, save.lv) / 1000)}秒熟 · ${crop.price}金`}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
