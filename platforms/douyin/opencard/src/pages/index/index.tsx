import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import { useLoad, useCardTaro, useDidHide, useDidShow } from "@tarojs/taro";
import {
  extractOpenCardLoadData,
  fetchCardData,
  resolveCardData,
  type CardCrop,
  type CardData,
  type FarmViewPayload,
  type OpenCardLoadData,
} from "@/services/card-data";
import { postCardHarvest } from "@/services/farm-actions";
import { PixelImage } from "@/components/pixel-image";
import "./index.css";

type Phase = "loading" | "ready" | "error";
type FarmerMode = "idle" | "walk" | "water" | "hoe";

interface Plot {
  cropId: string;
  plantedAt: number;
}

interface FloatTip {
  id: number;
  plot: number;
  text: string;
  kind: "coin" | "wait";
}

const COLS = 3;

export default function IndexPage() {
  const taroRef = useRef<openCardTaro>();
  const mountedRef = useRef(true);
  const bootstrappedRef = useRef(false);
  const loadDataRef = useRef<OpenCardLoadData>();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tipIdRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  const [farm, setFarm] = useState<FarmViewPayload | null>(null);
  const [plots, setPlots] = useState<(Plot | null)[]>([]);
  const [seedId, setSeedId] = useState("carrot");
  const [baseCoins, setBaseCoins] = useState(0);
  const [baseHarvests, setBaseHarvests] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [sessionHarvests, setSessionHarvests] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [ticking, setTicking] = useState(true);
  const [farmerPlot, setFarmerPlot] = useState(4);
  const [farmerMode, setFarmerMode] = useState<FarmerMode>("idle");
  const [facingLeft, setFacingLeft] = useState(false);
  const [tips, setTips] = useState<FloatTip[]>([]);
  const [coinPop, setCoinPop] = useState(0);
  const [shakePlot, setShakePlot] = useState(-1);

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

  const applyCardData = useCallback((data: CardData | null) => {
    if (!mountedRef.current) return;
    if (!data || data.displayMode !== "farm" || !data.views?.farm) {
      setPhase("error");
      return;
    }
    const view = data.views.farm;
    setFarm(view);
    setPlots((prev) => (prev.length === view.plotCount ? prev : Array.from({ length: view.plotCount }, () => null)));
    setSeedId(view.defaultCropId);
    setBaseCoins(data.userState?.coins ?? 0);
    setBaseHarvests(data.userState?.harvests ?? 0);
    setPhase("ready");
  }, []);

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

  useDidShow(() => setTicking(true));
  useDidHide(() => setTicking(false));

  // 有作物在长时才刷新进度
  const hasGrowing = plots.some((plot) => plot !== null);
  useEffect(() => {
    if (!ticking || !hasGrowing) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [ticking, hasGrowing]);

  const cropOf = useCallback(
    (id: string): CardCrop | undefined => farm?.crops.find((crop) => crop.id === id),
    [farm],
  );

  const addTip = useCallback(
    (plot: number, text: string, kind: FloatTip["kind"]) => {
      tipIdRef.current += 1;
      const id = tipIdRef.current;
      setTips((prev) => [...prev, { id, plot, text, kind }]);
      later(() => setTips((prev) => prev.filter((tip) => tip.id !== id)), 900);
    },
    [later],
  );

  const sendFarmer = useCallback(
    (target: number, work: FarmerMode) => {
      setFacingLeft(target % COLS < farmerPlot % COLS);
      setFarmerPlot(target);
      setFarmerMode("walk");
      later(() => setFarmerMode(work), 420);
      later(() => setFarmerMode("idle"), 1300);
    },
    [farmerPlot, later],
  );

  const onPlotTap = useCallback(
    (index: number) => {
      const plot = plots[index];
      const current = Date.now();
      setNow(current);
      if (!plot) {
        const crop = cropOf(seedId);
        if (!crop) return;
        setPlots((prev) => prev.map((item, i) => (i === index ? { cropId: crop.id, plantedAt: current } : item)));
        sendFarmer(index, "water");
        return;
      }
      const crop = cropOf(plot.cropId);
      if (!crop) return;
      const left = crop.growSeconds * 1000 - (current - plot.plantedAt);
      if (left > 0) {
        setShakePlot(index);
        later(() => setShakePlot(-1), 320);
        addTip(index, farm ? farm.copy.growingHint.replace("{s}", String(Math.ceil(left / 1000))) : "", "wait");
        return;
      }
      setPlots((prev) => prev.map((item, i) => (i === index ? null : item)));
      setSessionCoins((value) => value + crop.price);
      setSessionHarvests((value) => value + 1);
      setCoinPop((value) => value + 1);
      addTip(index, `+${crop.price}`, "coin");
      sendFarmer(index, "hoe");
      const taro = taroRef.current;
      if (taro) void postCardHarvest(taro, crop.id);
    },
    [plots, cropOf, seedId, sendFarmer, later, addTip, farm],
  );

  const coins = baseCoins + sessionCoins;
  const harvests = baseHarvests + sessionHarvests;
  const anyPlanted = plots.some((plot) => plot !== null);
  const ripeCount = plots.filter((plot) => {
    const crop = plot ? cropOf(plot.cropId) : undefined;
    return Boolean(plot && crop && now - plot.plantedAt >= crop.growSeconds * 1000);
  }).length;
  const statusText =
    ripeCount > 0 ? `${ripeCount} 块熟了，点它收获` : harvests > 0 ? `${farm?.copy.harvestedLabel ?? ""} ${harvests} 次` : anyPlanted ? "等它长大…" : farm?.copy.emptyHint ?? "";

  const farmerRow = Math.floor(farmerPlot / COLS);
  const farmerCol = farmerPlot % COLS;
  const farmerStyle = {
    left: `${((farmerCol + 0.82) / COLS) * 100}%`,
    top: farmerRow === 0 ? "calc(50% - 74px)" : "calc(50% + 30px)",
  };
  const farmerSheet =
    farmerMode === "walk" ? farm?.farmer.walk : farmerMode === "water" ? farm?.farmer.water : farm?.farmer.hoe;

  const renderPlot = (index: number) => {
    if (!farm) return null;
    const plot = plots[index] ?? null;
    const crop = plot ? cropOf(plot.cropId) : undefined;
    const progress = plot && crop ? Math.min(1, (now - plot.plantedAt) / (crop.growSeconds * 1000)) : 0;
    const ripe = Boolean(plot && crop && progress >= 1);
    const stageSrc = crop ? (ripe ? crop.stages.ripe : progress < 0.45 ? crop.stages.seed : crop.stages.growing) : "";
    const label = ripe ? farm.copy.ripeHint : plot ? `${crop?.name ?? ""}生长中` : farm.copy.emptyHint;
    const cellClass = `farm-plot${ripe ? " is-ripe" : ""}${shakePlot === index ? " is-shake" : ""}`;
    return (
      <View key={`plot-${index}`} className={cellClass} ariaLabel={label} onClick={() => onPlotTap(index)}>
        <PixelImage className="plot-soil" src={farm.soil} />
        {ripe ? <View className="plot-glow" /> : null}
        {crop ? <PixelImage className={ripe ? "plot-crop plot-crop-ripe" : "plot-crop"} src={stageSrc} /> : null}
        {ripe ? (
          <View className="plot-badge">
            <Text className="plot-badge-text">收</Text>
          </View>
        ) : null}
        {!plot && !anyPlanted && harvests === 0 ? <PixelImage className="plot-seed-hint" src={farm.seedIcon} /> : null}
        {plot && !ripe ? (
          <View className="plot-bar">
            <View className="plot-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
        ) : null}
        {tips
          .filter((tip) => tip.plot === index)
          .map((tip) => (
            <Text key={`tip-${tip.id}`} className={tip.kind === "coin" ? "plot-tip plot-tip-coin" : "plot-tip plot-tip-wait"}>
              {tip.text}
            </Text>
          ))}
      </View>
    );
  };

  return (
    <View className="widget-root farm-card">
      {phase === "ready" && farm ? (
        <View className="widget-header farm-hud">
          <View className="hud-coins">
            <PixelImage key={`coin-${coinPop}`} className={coinPop > 0 ? "hud-coin-icon is-pop" : "hud-coin-icon"} src={farm.coinIcon} />
            <Text className="hud-coin-value">{String(coins)}</Text>
          </View>
          <Text className="hud-status">{statusText}</Text>
        </View>
      ) : null}
      <View
        className={phase === "ready" ? "widget-body farm-body" : "widget-body widget-adaptive"}
        __lynx_timing_flag="__lynx_timing_actual_fmp"
      >
        {phase === "loading" ? <Text className="widget-state-message">农场开门中…</Text> : null}
        {phase === "error" ? (
          <View className="farm-error">
            <Text className="widget-state-message">农场暂时打不开</Text>
            <View className="farm-retry" ariaLabel="重试" onClick={() => void retry()}>
              <Text className="farm-retry-text">重试</Text>
            </View>
          </View>
        ) : null}
        {phase === "ready" && farm ? (
          <View className="farm-field">
            <View className="farm-row farm-row-first">{[0, 1, 2].map((i) => renderPlot(i))}</View>
            <View className="farm-row farm-row-last">{[3, 4, 5].map((i) => renderPlot(i))}</View>
            <View className={facingLeft ? "farmer is-left" : "farmer"} style={farmerStyle}>
              <View className="farmer-frame">
                <PixelImage
                  key={`farmer-${farmerMode}`}
                  className={farmerMode === "idle" ? "farmer-sheet" : "farmer-sheet is-anim"}
                  src={farmerSheet ?? ""}
                  mode="scaleToFill"
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {phase === "ready" && farm ? (
        <View className="widget-footer farm-seeds">
          {farm.crops.map((crop) => (
            <View
              key={crop.id}
              className={crop.id === seedId ? "seed-chip is-selected" : "seed-chip"}
              ariaLabel={`选择${crop.name}种子`}
              onClick={() => setSeedId(crop.id)}
            >
              <PixelImage className="seed-icon" src={crop.icon} />
              <View className="seed-text">
                <Text className="seed-name">{crop.name}</Text>
                <Text className="seed-meta">{`${crop.growSeconds}秒 · +${crop.price}`}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
