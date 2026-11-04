import electron from "electron";
import type {
  AppSettings,
  ArltHifiDesktopApi,
  AudioFileSelectionResult,
  FolderImportResult,
  LibraryImportProgress,
  LibraryImportResult,
  LibraryLocation,
  LibraryRescanResult,
  Track,
  TrackEdit,
  TrackMetadataEdit
} from "@arlt-hifi/shared";

const { contextBridge, ipcRenderer } = electron;
const selectAudioFilesChannel = "library:select-files";
const importAudioFilesChannel = "library:import-files";
const importAudioFolderChannel = "library:import-folder";
const cancelLibraryImportChannel = "library:cancel-import";
const loadLibraryChannel = "library:load";
const rescanLibraryChannel = "library:rescan";
const renameTrackChannel = "library:rename-track";
const editTrackChannel = "library:edit-track";
const applyTrackEditsChannel = "library:apply-edits";
const setTrackCoverChannel = "library:set-track-cover";
const deleteTrackChannel = "library:delete-track";
const openLibraryFolderChannel = "library:open-folder";
const getLibraryLocationChannel = "library:get-location";
const libraryChangedChannel = "library:changed";
const libraryImportProgressChannel = "library:import-progress";
const loadSettingsChannel = "settings:load";
const saveSettingsChannel = "settings:save";

const desktopApi: ArltHifiDesktopApi = {
  platform: process.platform,
  selectAudioFiles: async (): Promise<AudioFileSelectionResult> => {
    return ipcRenderer.invoke(selectAudioFilesChannel) as Promise<AudioFileSelectionResult>;
  },
  importAudioFiles: async (filePaths: readonly string[]): Promise<LibraryImportResult> => {
    return ipcRenderer.invoke(importAudioFilesChannel, [...filePaths]) as Promise<LibraryImportResult>;
  },
  importAudioFolder: async (): Promise<FolderImportResult> => {
    return ipcRenderer.invoke(importAudioFolderChannel) as Promise<FolderImportResult>;
  },
  cancelLibraryImport: async (): Promise<boolean> => {
    return ipcRenderer.invoke(cancelLibraryImportChannel) as Promise<boolean>;
  },
  loadLibrary: async (): Promise<readonly Track[]> => {
    return ipcRenderer.invoke(loadLibraryChannel) as Promise<readonly Track[]>;
  },
  rescanLibrary: async (): Promise<LibraryRescanResult> => {
    return ipcRenderer.invoke(rescanLibraryChannel) as Promise<LibraryRescanResult>;
  },
  renameTrack: async (trackId: string, title: string): Promise<Track> => {
    return ipcRenderer.invoke(renameTrackChannel, trackId, title) as Promise<Track>;
  },
  editTrack: async (trackId: string, edit: TrackMetadataEdit): Promise<Track> => {
    return ipcRenderer.invoke(editTrackChannel, trackId, edit) as Promise<Track>;
  },
  applyTrackEdits: async (edits: readonly TrackEdit[]): Promise<readonly Track[]> => {
    return ipcRenderer.invoke(applyTrackEditsChannel, [...edits]) as Promise<readonly Track[]>;
  },
  setTrackCover: async (trackId: string): Promise<Track | null> => {
    return ipcRenderer.invoke(setTrackCoverChannel, trackId) as Promise<Track | null>;
  },
  deleteTrack: async (trackId: string): Promise<boolean> => {
    return ipcRenderer.invoke(deleteTrackChannel, trackId) as Promise<boolean>;
  },
  openLibraryFolder: async (): Promise<void> => {
    await ipcRenderer.invoke(openLibraryFolderChannel);
  },
  getLibraryLocation: async (): Promise<LibraryLocation> => {
    return ipcRenderer.invoke(getLibraryLocationChannel) as Promise<LibraryLocation>;
  },
  onLibraryChanged: (handler: (tracks: readonly Track[]) => void): (() => void) => {
    const listener = (_event: unknown, tracks: readonly Track[]): void => {
      handler(tracks);
    };

    ipcRenderer.on(libraryChangedChannel, listener);

    return () => {
      ipcRenderer.removeListener(libraryChangedChannel, listener);
    };
  },
  onLibraryImportProgress: (handler: (progress: LibraryImportProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: LibraryImportProgress): void => {
      handler(progress);
    };

    ipcRenderer.on(libraryImportProgressChannel, listener);

    return () => {
      ipcRenderer.removeListener(libraryImportProgressChannel, listener);
    };
  },
  loadSettings: async (): Promise<AppSettings> => {
    return ipcRenderer.invoke(loadSettingsChannel) as Promise<AppSettings>;
  },
  saveSettings: async (settings: AppSettings): Promise<AppSettings> => {
    return ipcRenderer.invoke(saveSettingsChannel, settings) as Promise<AppSettings>;
  }
};

contextBridge.exposeInMainWorld("arltHifiDesktop", desktopApi);
