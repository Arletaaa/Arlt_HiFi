import electron from "electron";
import type {
  AppSettings,
  ArltHifiDesktopApi,
  AudioFileSelectionResult,
  FolderImportResult,
  LibraryImportProgress,
  LibraryImportResult,
  Track,
  TrackMetadataEdit
} from "@arlhifi/shared";

const { contextBridge, ipcRenderer } = electron;
const selectAudioFilesChannel = "library:select-files";
const importAudioFilesChannel = "library:import-files";
const importAudioFolderChannel = "library:import-folder";
const loadLibraryChannel = "library:load";
const renameTrackChannel = "library:rename-track";
const editTrackChannel = "library:edit-track";
const setTrackCoverChannel = "library:set-track-cover";
const deleteTrackChannel = "library:delete-track";
const openLibraryFolderChannel = "library:open-folder";
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
  loadLibrary: async (): Promise<readonly Track[]> => {
    return ipcRenderer.invoke(loadLibraryChannel) as Promise<readonly Track[]>;
  },
  renameTrack: async (trackId: string, title: string): Promise<Track> => {
    return ipcRenderer.invoke(renameTrackChannel, trackId, title) as Promise<Track>;
  },
  editTrack: async (trackId: string, edit: TrackMetadataEdit): Promise<Track> => {
    return ipcRenderer.invoke(editTrackChannel, trackId, edit) as Promise<Track>;
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
