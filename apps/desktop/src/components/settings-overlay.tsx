import { useState } from "react";
import { useLibraryImport } from "../hooks/use-library-import";
import { useLibraryRescan } from "../hooks/use-library-rescan";
import { assetUrl } from "../lib/asset-url";
import { usePlayerStore } from "../store/player-store";
import { useSettingsStore } from "../store/settings-store";
import { ManageOverlay } from "./manage-overlay";

interface Swatch {
  readonly base: string;
  readonly id: string;
  readonly image?: string;
}

const TABLE_SWATCHES: readonly Swatch[] = [
  { id: "wood029", image: assetUrl("/textures/swatches/wood029.jpg"), base: "#6b4f34" },
  { id: "wood066", image: assetUrl("/textures/swatches/wood066.jpg"), base: "#8a5a35" },
  { id: "wood069", image: assetUrl("/textures/swatches/wood069.jpg"), base: "#5a4030" },
  { id: "wood095", image: assetUrl("/textures/swatches/wood095.jpg"), base: "#3f2f26" }
];

const BASE_SWATCHES: readonly Swatch[] = [
  { id: "wood002", image: assetUrl("/textures/swatches/wood002.jpg"), base: "#4a3324" },
  { id: "wood007", image: assetUrl("/textures/swatches/wood007.jpg"), base: "#6b4f34" },
  { id: "wood092", image: assetUrl("/textures/swatches/wood092.jpg"), base: "#2f3a2f" },
  { id: "wood096", image: assetUrl("/textures/swatches/wood096.jpg"), base: "#2a2b30" }
];

const WALL_SWATCHES: readonly Swatch[] = [
  { id: "fabric009", image: assetUrl("/textures/swatches/fabric009.jpg"), base: "#5d2b2b" },
  { id: "fabric048", image: assetUrl("/textures/swatches/fabric048.jpg"), base: "#8a8378" },
  { id: "leather012", image: assetUrl("/textures/swatches/leather012.jpg"), base: "#4a3b33" },
  { id: "woodsiding009", image: assetUrl("/textures/swatches/woodsiding009.jpg"), base: "#6b6152" }
];

const LIGHT_SWATCHES: readonly Swatch[] = [
  { id: "morning", base: "#f0d7b4" },
  { id: "night", base: "#7fa6c9" },
  { id: "spot", base: "#fff4e2" },
  { id: "starry", base: "#26346a" }
];

/**
 * 材质球用的是 192² 缩略图（12 张共约 70KB），不是 2048 的场景贴图：
 * 打开设置前就在后台解码好，球不会一张张刷出来。
 */
if (typeof window !== "undefined") {
  const images = [...TABLE_SWATCHES, ...BASE_SWATCHES, ...WALL_SWATCHES]
    .map((swatch) => swatch.image)
    .filter((image): image is string => Boolean(image));

  for (const image of images) {
    const warm = new Image();
    warm.decoding = "async";
    warm.src = image;
    void warm.decode().catch(() => undefined);
  }
}

interface GroupProps {
  readonly items: readonly Swatch[];
  readonly label: string;
  readonly onChange: (id: string) => void;
  readonly value: string;
}

/** 一组材质球：超过 4 个时横向滚动。 */
const SwatchGroup = ({ items, label, onChange, value }: GroupProps) => (
  <div className="preset-group">
    <p className="preset-group__label">{label}</p>
    <div className="preset-group__strip">
      {items.map((item) => (
        <button
          className={`preset-ball${item.id === value ? " is-active" : ""}`}
          key={item.id}
          onClick={() => {
            onChange(item.id);
          }}
          type="button"
        >
          <span
            className="preset-ball__surface"
            style={
              item.image
                ? { backgroundImage: `url(${item.image})`, backgroundColor: item.base }
                : { backgroundColor: item.base }
            }
          />
        </button>
      ))}
    </div>
  </div>
);

export interface SettingsOverlayProps {
  readonly onClose: () => void;
}

/** 全透明设置浮层：音乐库导入/排序/管理 + 两列材质选择 + 音量 + 置底版权。 */
export const SettingsOverlay = ({ onClose }: SettingsOverlayProps) => {
  const volume = usePlayerStore((state) => state.volume);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const library = usePlayerStore((state) => state.library);
  const scenePreset = useSettingsStore((state) => state.scenePreset);
  const setScenePreset = useSettingsStore((state) => state.setScenePreset);
  const {
    busy: importBusy,
    cancelImport,
    continueImport,
    importFiles,
    importFolder,
    state: importState
  } = useLibraryImport();
  const { busy: rescanBusy, rescan, state: rescanState } = useLibraryRescan();
  const [manageOpen, setManageOpen] = useState(false);
  const busy = importBusy || rescanBusy;
  const progressLabel = importBusy
    ? importState.progress
      ? `正在导入 ${importState.progress.completed}/${importState.progress.total}`
      : "正在导入…"
    : "正在重扫标签…";

  return (
    <>
      <div className="settings-overlay__inner">
        <button aria-label="关闭设置" className="settings-overlay__close" onClick={onClose} type="button">
          ✕
        </button>

        <section aria-label="音乐库" className="library-import">
          <div className="library-import__head">
            <p className="preset-group__label">音乐库</p>
            <p className="library-import__count">{library.length} 首已托管</p>
          </div>
          <div className="library-import__actions">
            <button className="library-import__button" disabled={busy} onClick={importFiles} type="button">
              选择音频文件
            </button>
            <button className="library-import__button" disabled={busy} onClick={importFolder} type="button">
              导入文件夹
            </button>
            {importBusy ? (
              <button className="library-import__button" onClick={cancelImport} type="button">
                取消导入
              </button>
            ) : null}
            {!busy && importState.remaining && importState.remaining.length > 0 ? (
              <button className="library-import__button" onClick={continueImport} type="button">
                继续导入 {importState.remaining.length} 首
              </button>
            ) : null}
            <button className="library-import__button" onClick={() => { setManageOpen(true); }} type="button">
              管理歌曲
            </button>
            <button
              className="library-import__button"
              disabled={busy}
              onClick={rescan}
              title="重读旧库标签，只补空缺字段，不覆盖已修改的值"
              type="button"
            >
              重扫标签
            </button>
            {busy ? (
              <span aria-live="polite" className="library-import__status">
                {progressLabel}
              </span>
            ) : null}
          </div>
          {!busy && importState.message ? (
            <p
              className={`library-import__status${importState.phase === "error" ? " is-error" : ""}`}
              role="status"
            >
              {importState.message}
            </p>
          ) : null}
          {!busy && rescanState.message ? (
            <p
              className={`library-import__status${rescanState.phase === "error" ? " is-error" : ""}`}
              role="status"
            >
              {rescanState.message}
            </p>
          ) : null}
        </section>

      <div className="preset-pair">
        <SwatchGroup items={TABLE_SWATCHES} label="台面" onChange={(id) => { setScenePreset({ table: id }); }} value={scenePreset.table} />
        <SwatchGroup items={BASE_SWATCHES} label="台底" onChange={(id) => { setScenePreset({ base: id }); }} value={scenePreset.base} />
      </div>

      <div className="preset-pair">
        <SwatchGroup items={WALL_SWATCHES} label="墙面" onChange={(id) => { setScenePreset({ wall: id }); }} value={scenePreset.wall} />
        <SwatchGroup items={LIGHT_SWATCHES} label="光效" onChange={(id) => { setScenePreset({ light: id }); }} value={scenePreset.light} />
      </div>

      <div className="settings-footer">
        <div className="overlay-volume__row">
          <p className="overlay-volume__label">音量</p>
          <input
            aria-label="音量"
            className="overlay-volume"
            max={100}
            min={0}
            onChange={(event) => {
              setVolume(Number(event.currentTarget.value));
            }}
            type="range"
            value={volume}
          />
        </div>
      </div>

      <p className="settings-overlay__credit">
        "CD Jewel Case" by 蓝人组合 · CC-BY 4.0 · "CD player" by nguyentrongtam0512 · CC-BY 4.0
      </p>
      </div>

      {manageOpen ? (
        <ManageOverlay
          onClose={() => {
            setManageOpen(false);
          }}
        />
      ) : null}
    </>
  );
};
