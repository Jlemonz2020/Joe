export type ProviderId = 'openai' | 'deepseek' | 'custom'

export type ProviderProtocol = 'chat' | 'responses'

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export type ChatRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  createdAt: string
}

export type ProviderConfig = {
  profileId: string
  model: string
  reasoningEffort: ReasoningEffort
  disableResponseStorage: boolean
  temperature: number
  maxOutputTokens: number
}

export type ProviderProfile = {
  id: string
  name: string
  provider: ProviderId
  baseUrl: string
  defaultModel: string
  models: string[]
  protocol: ProviderProtocol
  reasoningEffort: ReasoningEffort
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  apiKeySet: boolean
}

export type ProviderProfileInput = {
  id?: string
  name: string
  provider: ProviderId
  baseUrl: string
  defaultModel: string
  models: string[]
  protocol: ProviderProtocol
  reasoningEffort: ReasoningEffort
  disableResponseStorage: boolean
  requiresOpenAiAuth: boolean
  apiKey?: string
}

export type ProviderModelInfo = {
  id: string
  ownedBy?: string
}

export type ProviderModelTestResult = {
  ok: boolean
  model: string
  latencyMs: number
  message: string
}

export type ImageGenerationConfig = {
  baseUrl: string
  model: string
  size: string
  quality: string
  promptProfileId: string
  promptModel: string
  requiresOpenAiAuth: boolean
  apiKeySet: boolean
}

export type ImageGenerationConfigInput = {
  baseUrl: string
  model: string
  size: string
  quality: string
  promptProfileId: string
  promptModel: string
  requiresOpenAiAuth: boolean
  apiKey?: string
}

export type ImagePromptRequest = {
  source: string
  config: ImageGenerationConfigInput
}

export type ImageGenerationRequest = {
  prompt: string
  config: ImageGenerationConfigInput
}

export type ImageGenerationResult = {
  prompt: string
  imageUrl?: string
  revisedPrompt?: string
  message: string
}

export type ProviderStatus = {
  provider: ProviderId
  hasKey: boolean
}

export type WorkspaceInfo = {
  root: string
  files: FileEntry[]
}

export type FileEntry = {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
}

export type ReadFileResult = {
  path: string
  content: string
}

export type WriteFileResult = {
  path: string
  diff: string
}

export type CreateEntryResult = {
  path: string
  type: 'file' | 'directory'
}

export type CommandRequest = {
  workspaceRoot: string
  command: string
  confirmed?: boolean
}

export type CommandResult = {
  command: string
  safe: boolean
  requiresConfirmation: boolean
  reason?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

export type OpenPathResult = {
  ok: boolean
  openedPath?: string
  message?: string
}

export type AgentActionResult = {
  type: 'read_file' | 'write_file' | 'run_command'
  path?: string
  command?: string
  ok: boolean
  summary: string
  diff?: string
}

export type ChatRequest = {
  config: ProviderConfig
  messages: ChatMessage[]
  workspaceRoot?: string
}

export type ChatResponse = {
  message: ChatMessage
  actions: AgentActionResult[]
}

export type ChatStreamEvent =
  | {
      type: 'start'
      message: ChatMessage
    }
  | {
      type: 'replace'
      messageId: string
      content: string
    }
  | {
      type: 'actions'
      actions: AgentActionResult[]
    }

export type AppBridge = {
  selectWorkspace: () => Promise<WorkspaceInfo | null>
  listFiles: (workspaceRoot: string) => Promise<FileEntry[]>
  readFile: (workspaceRoot: string, filePath: string) => Promise<ReadFileResult>
  writeFile: (
    workspaceRoot: string,
    filePath: string,
    content: string,
  ) => Promise<WriteFileResult>
  createFile: (
    workspaceRoot: string,
    filePath: string,
  ) => Promise<CreateEntryResult>
  createDirectory: (
    workspaceRoot: string,
    directoryPath: string,
  ) => Promise<CreateEntryResult>
  runCommand: (request: CommandRequest) => Promise<CommandResult>
  openPath: (targetPath: string) => Promise<OpenPathResult>
  listProviderProfiles: () => Promise<ProviderProfile[]>
  saveProviderProfile: (
    profile: ProviderProfileInput,
  ) => Promise<ProviderProfile>
  deleteProviderProfile: (id: string) => Promise<ProviderProfile[]>
  searchProviderModels: (
    profile: ProviderProfileInput,
  ) => Promise<ProviderModelInfo[]>
  testProviderModel: (
    profile: ProviderProfileInput,
  ) => Promise<ProviderModelTestResult>
  getImageGenerationConfig: () => Promise<ImageGenerationConfig>
  saveImageGenerationConfig: (
    config: ImageGenerationConfigInput,
  ) => Promise<ImageGenerationConfig>
  buildImagePrompt: (request: ImagePromptRequest) => Promise<string>
  generateImage: (
    request: ImageGenerationRequest,
  ) => Promise<ImageGenerationResult>
  chat: (request: ChatRequest) => Promise<ChatResponse>
  chatStream: (
    request: ChatRequest,
    onEvent: (event: ChatStreamEvent) => void,
  ) => Promise<ChatResponse>
}
