import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, PlaybackMode, Track } from "@arlt-hifi/shared";
import { createPortal } from "react-dom";
import { SettingsOverlay } from "./components/settings-overlay";
import { useApplyPreferences } from "./hooks/use-app-preferences";
import { useSaveSettings } from "./hooks/use-settings-sync";
import { useAudioPlayback } from "./hooks/use-audio-playback";
import { groupTracksForGallery } from "./lib/album-groups";
import { filterTracks } from "./lib/library-filter";
import { isGalleryChromeVisible } from "./scene/scene-transition";
import type { ScenePhase } from "./scene/scene-transition";
import { SceneStage } from "./scene/scene-stage";
import { usePlayerStore } from "./store/player-store";
import { useSettingsStore } from "./store/settings-store";

const MAX_SEARCH_RESULTS = 8;

export const App = () => {
  useAudioPlayback();
  useApplyPreferences();

  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(window.location.search).get("settings") === "1");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ groupId: string; nonce: number } | null>(null);
  const [scenePhase, setScenePhase] = useState<ScenePhase>("gallery");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchVisible = isGalleryChromeVisible(scenePhase);

  const library = usePlayerStore((state) => state.library);
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null);
  const loadLibrary = usePlayerStore((state) => state.loadLibrary);
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const librarySort = useSettingsStore((state) => state.librarySort);
  const cdOrder = useSettingsStore((state) => state.cdOrder);

  const searchResults = useMemo(() => {
    if (searchQuery.trim().length === 0) {
      return [];
    }

    return filterTracks(library, searchQuery).slice(0, MAX_SEARCH_RESULTS);
  }, [library, searchQuery]);

  const galleryGroups = useMemo(
    () => groupTracksForGallery(library, librarySort, cdOrder),
    [cdOrder, library, librarySort]
  );

  useSaveSettings();

  useEffect(() => {
    const api = window.arltHifiDesktop;

    if (!api) {
      // 网页预览：从 localStorage 恢复上次的设置（含场景预设）。
      const stored = window.localStorage.getItem("arlt-hifi-settings");

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AppSettings;
          const parsedMode: unknown = (parsed as { playbackMode?: unknown }).playbackMode;
          const playbackMode: PlaybackMode =
            parsedMode === "sequential" || parsedMode === "loop" || parsedMode === "shuffle"
              ? parsedMode
              : parsedMode === "stop"
                ? "sequential"
                : parsedMode === "repeat-one"
                  ? "loop"
                  : "sequential";

          hydrateSettings(parsed);
          usePlayerStore.setState({
            playbackMode,
            volume: parsed.volume
          });
        } catch {
          // 解析失败就保持默认值。
        }
      }

      return;
    }

    let cancelled = false;

    void api.loadSettings().then((settings) => {
      if (cancelled) {
        return;
      }

      hydrateSettings(settings);
      usePlayerStore.setState({
        playbackMode: settings.playbackMode,
        volume: settings.volume
      });
    });

    // 曲库以主进程的库清单为准：导入过的文件都在 userData/library 下。
    void api.loadLibrary().then((tracks) => {
      if (!cancelled) {
        loadLibrary(tracks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, loadLibrary]);

  // 切回窗口时重新读取清单：在文件管理器里删改曲目后不必重启应用。
  useEffect(() => {
    const api = window.arltHifiDesktop;

    if (!api) {
      return;
    }

    let cancelled = false;

    const refreshLibrary = (): void => {
      void api.loadLibrary().then((tracks) => {
        if (!cancelled) {
          loadLibrary(tracks);
        }
      });
    };

    window.addEventListener("focus", refreshLibrary);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshLibrary);
    };
  }, [loadLibrary]);

  // 托管目录被外部删改时，主进程会推送最新清单。
  useEffect(() => {
    const api = window.arltHifiDesktop;

    if (!api) {
      return;
    }

    let cancelled = false;

    const unsubscribe = api.onLibraryChanged((tracks) => {
      if (!cancelled) {
        loadLibrary(tracks);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadLibrary]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // 管理弹窗叠在设置上时，Esc 只关管理弹窗，设置保持打开。
      if (event.key === "Escape" && !document.querySelector(".settings-overlay--manage")) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // 进入交互区就收起搜索：清空输入并移走焦点，避免对着看不见的输入框打字。
  useEffect(() => {
    if (searchVisible) {
      return;
    }

    searchInputRef.current?.blur();
    setSearchQuery("");
    setActiveResultIndex(0);
  }, [searchVisible]);

  const handleScenePhaseChange = useCallback((phase: ScenePhase): void => {
    setScenePhase(phase);
  }, []);

  const flyToTrack = (track: Track): void => {
    const group = galleryGroups.find((candidate) => candidate.trackIds.includes(track.id));

    if (!group) {
      return;
    }

    setFocusRequest((current) => ({ groupId: group.id, nonce: (current?.nonce ?? 0) + 1 }));
    setSearchQuery("");
    setActiveResultIndex(0);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((index) => Math.min(index + 1, Math.max(0, searchResults.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (event.key === "Enter") {
      const target = searchResults[activeResultIndex] ?? searchResults[0];

      if (target) {
        event.preventDefault();
        flyToTrack(target);
      }

      return;
    }

    if (event.key === "Escape") {
      setSearchQuery("");
      setActiveResultIndex(0);
    }
  };

  const showSearchResults = searchVisible && searchQuery.trim().length > 0;

  return (
    <div className="app app--gallery">
      <SceneStage
        currentTrackId={currentTrackId}
        focusGroupId={focusRequest?.groupId ?? null}
        focusNonce={focusRequest?.nonce ?? 0}
        groups={galleryGroups}
        onPhaseChange={handleScenePhaseChange}
        tracks={library}
      />

      <div
        aria-hidden={!searchVisible}
        className={`gallery-topbar${searchVisible ? "" : " is-hidden"}`}
      >
        <input
          aria-activedescendant={
            searchResults.length > 0 ? `gallery-search-result-${activeResultIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="gallery-search-results"
          aria-expanded={showSearchResults}
          aria-label="搜索曲目"
          className="gallery-search"
          onChange={(event) => {
            setSearchQuery(event.currentTarget.value);
            setActiveResultIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="搜索专辑 · 艺术家 · 曲目"
          ref={searchInputRef}
          role="combobox"
          tabIndex={searchVisible ? 0 : -1}
          type="search"
          value={searchQuery}
        />

        {showSearchResults ? (
          <ul aria-label="搜索结果" className="search-results" id="gallery-search-results" role="listbox">
            {searchResults.length === 0 ? (
              <li className="search-results__empty" role="presentation">没有匹配的曲目</li>
            ) : (
              searchResults.map((track, index) => (
                <li
                  aria-selected={index === activeResultIndex}
                  className={`search-results__item${index === activeResultIndex ? " is-active" : ""}`}
                  id={`gallery-search-result-${index}`}
                  key={track.id}
                  onClick={() => {
                    flyToTrack(track);
                  }}
                  onMouseEnter={() => {
                    setActiveResultIndex(index);
                  }}
                  role="option"
                >
                  <span className="search-results__title">{track.title}</span>
                  <span className="search-results__meta">
                    {track.artist} · {track.album}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

        <button
          aria-label="设置"
          className="gallery-settings"
          onClick={() => {
            setSettingsOpen((open) => !open);
          }}
          type="button"
        >
          ⚙
        </button>

      {settingsOpen ? createPortal((
        <div
          className="settings-overlay"
          onClick={() => {
            setSettingsOpen(false);
          }}
          role="presentation"
        >
          <div
            className="settings-overlay__panel"
            onClick={(event) => {
              event.stopPropagation();
            }}
            role="dialog"
          >
            <SettingsOverlay onClose={() => { setSettingsOpen(false); }} />
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
};
