import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppBridge,
  ChatRequest,
  ChatStreamEvent,
  CommandRequest,
  ImageGenerationConfigInput,
  ImageGenerationRequest,
  ImagePromptRequest,
  ProviderProfileInput,
} from '../shared/types'

const bridge: AppBridge = {
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),

  listFiles: (workspaceRoot: string) =>
    ipcRenderer.invoke('workspace:list-files', workspaceRoot),

  readFile: (workspaceRoot: string, filePath: string) =>
    ipcRenderer.invoke('workspace:read-file', workspaceRoot, filePath),

  writeFile: (workspaceRoot: string, filePath: string, content: string) =>
    ipcRenderer.invoke('workspace:write-file', workspaceRoot, filePath, content),

  createFile: (workspaceRoot: string, filePath: string) =>
    ipcRenderer.invoke('workspace:create-file', workspaceRoot, filePath),

  createDirectory: (workspaceRoot: string, directoryPath: string) =>
    ipcRenderer.invoke(
      'workspace:create-directory',
      workspaceRoot,
      directoryPath,
    ),

  runCommand: (request: CommandRequest) =>
    ipcRenderer.invoke('command:run', request),

  openPath: (targetPath: string) =>
    ipcRenderer.invoke('shell:open-path', targetPath),

  listProviderProfiles: () => ipcRenderer.invoke('provider:list-profiles'),

  saveProviderProfile: (profile: ProviderProfileInput) =>
    ipcRenderer.invoke('provider:save-profile', profile),

  deleteProviderProfile: (id: string) =>
    ipcRenderer.invoke('provider:delete-profile', id),

  searchProviderModels: (profile: ProviderProfileInput) =>
    ipcRenderer.invoke('provider:search-models', profile),

  testProviderModel: (profile: ProviderProfileInput) =>
    ipcRenderer.invoke('provider:test-model', profile),

  getImageGenerationConfig: () => ipcRenderer.invoke('image:get-config'),

  saveImageGenerationConfig: (config: ImageGenerationConfigInput) =>
    ipcRenderer.invoke('image:save-config', config),

  buildImagePrompt: (request: ImagePromptRequest) =>
    ipcRenderer.invoke('image:build-prompt', request),

  generateImage: (request: ImageGenerationRequest) =>
    ipcRenderer.invoke('image:generate', request),

  chat: (request: ChatRequest) => ipcRenderer.invoke('ai:chat', request),

  chatStream: async (
    request: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
  ) => {
    const streamId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const channel = `ai:chat-stream:${streamId}`
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: ChatStreamEvent,
    ) => {
      onEvent(event)
    }

    ipcRenderer.on(channel, listener)
    try {
      return await ipcRenderer.invoke('ai:chat-stream', streamId, request)
    } finally {
      ipcRenderer.removeListener(channel, listener)
    }
  },
}

contextBridge.exposeInMainWorld('hcAgent', bridge)
