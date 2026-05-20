import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  screen,
  shell,
} from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createTwoFilesPatch } from 'diff'
import type { Dirent } from 'node:fs'
import type {
  AgentActionResult,
  ChatStreamEvent,
  ChatRequest,
  ChatResponse,
  CommandRequest,
  CommandResult,
  CreateEntryResult,
  FileEntry,
  ImageGenerationConfig,
  ImageGenerationConfigInput,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImagePromptRequest,
  OpenPathResult,
  ProviderId,
  ProviderModelInfo,
  ProviderModelTestResult,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProtocol,
  ReasoningEffort,
  ReadFileResult,
  WriteFileResult,
  WorkspaceInfo,
} from '../shared/types'
import type { OpenDialogOptions } from 'electron'

const DEV_SERVER_URL = 'http://127.0.0.1:5173'
const GENERATED_IMAGE_PROTOCOL = 'hc-image'
const MAX_FILE_BYTES = 420_000
const MAX_LISTED_FILES = 200_000
const MAX_DIRECTORY_DEPTH = 64
const MAX_TOOL_ROUNDS = 5
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'release',
])

type StoredProviderProfile = {
  id: string
  name: string
  provider: ProviderId
  baseUrl: string
  defaultModel: string
  models?: string[]
  protocol: ProviderProtocol
  reasoningEffort?: ReasoningEffort
  disableResponseStorage?: boolean
  requiresOpenAiAuth?: boolean
  encryptedApiKey?: string
}

type StoredImageGenerationConfig = {
  baseUrl: string
  model: string
  size: string
  quality: string
  promptProfileId: string
  promptModel: string
  requiresOpenAiAuth: boolean
  encryptedApiKey?: string
}

type SecureStore = Partial<Record<ProviderId, string>> & {
  profiles?: StoredProviderProfile[]
  imageGeneration?: StoredImageGenerationConfig
}

type ProviderMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type AgentEnvelope = {
  message?: string
  done?: boolean
  actions?: AgentAction[]
}

type AgentAction =
  | {
      type: 'read_file'
      path: string
    }
  | {
      type: 'write_file'
      path: string
      content: string
    }
  | {
      type: 'run_command'
      command: string
    }

type ChatStreamSink = {
  emit: (event: ChatStreamEvent) => void
}

type AgentActionExecutionResult = AgentActionResult & {
  observation?: string
}

type ProviderStreamHandler = (rawText: string) => void

type SseMessage = {
  event?: string
  data: string
}

type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

type WindowState = {
  bounds: WindowBounds
  isMaximized: boolean
}

let mainWindow: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: GENERATED_IMAGE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
])

app.setName('HC AI 编程助手')

function createWindow() {
  const windowState = readWindowState()
  const initialBounds = normalizeWindowBounds(
    windowState?.bounds ?? createDefaultWindowBounds(),
  )

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 720,
    minHeight: 480,
    title: 'HC AI 编程助手',
    autoHideMenuBar: true,
    backgroundColor: '#f7f7f4',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  })

  Menu.setApplicationMenu(null)

  const persistWindowState = debounce(() => {
    if (!mainWindow) {
      return
    }

    writeWindowState({
      bounds: mainWindow.isMaximized()
        ? mainWindow.getNormalBounds()
        : mainWindow.getBounds(),
      isMaximized: mainWindow.isMaximized(),
    })
  }, 300)

  mainWindow.on('resize', persistWindowState)
  mainWindow.on('move', persistWindowState)
  mainWindow.on('close', () => {
    persistWindowState.flush()
  })

  mainWindow.once('ready-to-show', () => {
    if (windowState?.isMaximized) {
      mainWindow?.maximize()
    }
    mainWindow?.show()
    mainWindow?.focus()
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL(DEV_SERVER_URL)
  }
}

function createDefaultWindowBounds(): WindowBounds {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.max(1100, Math.min(1480, workArea.width - 32))
  const height = Math.max(720, Math.min(920, workArea.height - 64))

  return {
    x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2)),
    width,
    height,
  }
}

function normalizeWindowBounds(bounds: WindowBounds): WindowBounds {
  const display =
    screen
      .getAllDisplays()
      .find((item) => rectanglesIntersect(item.workArea, bounds)) ??
    screen.getPrimaryDisplay()
  const { workArea } = display
  const width = Math.min(Math.max(bounds.width, 720), workArea.width)
  const height = Math.min(Math.max(bounds.height, 480), workArea.height)

  return {
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
  }
}

function rectanglesIntersect(left: WindowBounds, right: WindowBounds) {
  return !(
    right.x >= left.x + left.width ||
    right.x + right.width <= left.x ||
    right.y >= left.y + left.height ||
    right.y + right.height <= left.y
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function readWindowState(): WindowState | null {
  const statePath = getWindowStatePath()
  if (!fsSync.existsSync(statePath)) {
    return null
  }

  try {
    const state = JSON.parse(fsSync.readFileSync(statePath, 'utf8')) as WindowState
    if (
      typeof state.bounds?.x !== 'number' ||
      typeof state.bounds?.y !== 'number' ||
      typeof state.bounds?.width !== 'number' ||
      typeof state.bounds?.height !== 'number'
    ) {
      return null
    }
    return state
  } catch {
    return null
  }
}

function writeWindowState(state: WindowState) {
  const statePath = getWindowStatePath()
  fsSync.mkdirSync(path.dirname(statePath), { recursive: true })
  fsSync.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function debounce<T extends (...args: never[]) => void>(callback: T, delay: number) {
  let timer: NodeJS.Timeout | undefined

  const debounced = (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = undefined
      callback(...args)
    }, delay)
  }

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    callback()
  }

  return debounced
}

app.whenReady().then(() => {
  registerGeneratedImageProtocol()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function registerGeneratedImageProtocol() {
  protocol.handle(GENERATED_IMAGE_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const fileName = decodeURIComponent(url.pathname.replace(/^\/+/u, ''))

      if (
        url.hostname !== 'generated' ||
        !fileName ||
        fileName.includes('/') ||
        fileName.includes('\\')
      ) {
        return new Response('Bad image request.', { status: 400 })
      }

      const imageBuffer = await fs.readFile(
        path.join(getGeneratedImageDirectory(), fileName),
      )

      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'image/png',
        },
      })
    } catch {
      return new Response('Image not found.', { status: 404 })
    }
  })
}

function registerIpcHandlers() {
  ipcMain.handle('workspace:select', async (): Promise<WorkspaceInfo | null> => {
    const dialogOptions: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: '选择代码项目目录',
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const root = path.resolve(result.filePaths[0])
    return {
      root,
      files: await listWorkspaceFiles(root),
    }
  })

  ipcMain.handle(
    'workspace:list-files',
    async (_event, workspaceRoot: string): Promise<FileEntry[]> =>
      listWorkspaceFiles(path.resolve(workspaceRoot)),
  )

  ipcMain.handle(
    'workspace:read-file',
    async (
      _event,
      workspaceRoot: string,
      filePath: string,
    ): Promise<ReadFileResult> => readWorkspaceFile(workspaceRoot, filePath),
  )

  ipcMain.handle(
    'workspace:write-file',
    async (
      _event,
      workspaceRoot: string,
      filePath: string,
      content: string,
    ): Promise<WriteFileResult> =>
      writeWorkspaceFile(workspaceRoot, filePath, content, 'user'),
  )

  ipcMain.handle(
    'workspace:create-file',
    async (
      _event,
      workspaceRoot: string,
      filePath: string,
    ): Promise<CreateEntryResult> => createWorkspaceFile(workspaceRoot, filePath),
  )

  ipcMain.handle(
    'workspace:create-directory',
    async (
      _event,
      workspaceRoot: string,
      directoryPath: string,
    ): Promise<CreateEntryResult> =>
      createWorkspaceDirectory(workspaceRoot, directoryPath),
  )

  ipcMain.handle(
    'command:run',
    async (_event, request: CommandRequest): Promise<CommandResult> =>
      runWorkspaceCommand(request),
  )

  ipcMain.handle(
    'shell:open-path',
    async (_event, targetPath: string): Promise<OpenPathResult> =>
      openFilesystemPath(targetPath),
  )

  ipcMain.handle(
    'provider:list-profiles',
    async (): Promise<ProviderProfile[]> => listProviderProfiles(),
  )

  ipcMain.handle(
    'provider:save-profile',
    async (
      _event,
      profile: ProviderProfileInput,
    ): Promise<ProviderProfile> => saveProviderProfile(profile),
  )

  ipcMain.handle(
    'provider:delete-profile',
    async (_event, id: string): Promise<ProviderProfile[]> =>
      deleteProviderProfile(id),
  )

  ipcMain.handle(
    'provider:search-models',
    async (
      _event,
      profile: ProviderProfileInput,
    ): Promise<ProviderModelInfo[]> => searchProviderModels(profile),
  )

  ipcMain.handle(
    'provider:test-model',
    async (
      _event,
      profile: ProviderProfileInput,
    ): Promise<ProviderModelTestResult> => testProviderModel(profile),
  )

  ipcMain.handle(
    'image:get-config',
    async (): Promise<ImageGenerationConfig> => getImageGenerationConfig(),
  )

  ipcMain.handle(
    'image:save-config',
    async (
      _event,
      config: ImageGenerationConfigInput,
    ): Promise<ImageGenerationConfig> => saveImageGenerationConfig(config),
  )

  ipcMain.handle(
    'image:build-prompt',
    async (_event, request: ImagePromptRequest): Promise<string> =>
      buildImagePrompt(request),
  )

  ipcMain.handle(
    'image:generate',
    async (
      _event,
      request: ImageGenerationRequest,
    ): Promise<ImageGenerationResult> => generateImage(request),
  )

  ipcMain.handle(
    'ai:chat',
    async (_event, request: ChatRequest): Promise<ChatResponse> =>
      runAgentChat(request),
  )

  ipcMain.handle(
    'ai:chat-stream',
    async (
      event,
      streamId: string,
      request: ChatRequest,
    ): Promise<ChatResponse> => {
      const channel = `ai:chat-stream:${streamId}`
      return runAgentChat(request, {
        emit: (streamEvent) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(channel, streamEvent)
          }
        },
      })
    },
  )
}

async function listWorkspaceFiles(root: string): Promise<FileEntry[]> {
  const absoluteRoot = path.resolve(root)
  const rootStats = await fs.stat(absoluteRoot)
  if (!rootStats.isDirectory()) {
    throw new Error('工作区必须是文件夹。')
  }

  const entries: FileEntry[] = []
  const visitedDirectories = new Set<string>()

  async function walk(current: string, depth: number) {
    if (entries.length >= MAX_LISTED_FILES || depth > MAX_DIRECTORY_DEPTH) {
      return
    }

    const directoryKey = await readRealPathKey(current)
    if (visitedDirectories.has(directoryKey)) {
      return
    }
    visitedDirectories.add(directoryKey)

    let directoryEntries: Dirent[]
    try {
      directoryEntries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    directoryEntries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })

    const childDirectories: string[] = []

    for (const directoryEntry of directoryEntries) {
      if (entries.length >= MAX_LISTED_FILES) {
        break
      }

      if (directoryEntry.isSymbolicLink()) {
        continue
      }

      const entryType: FileEntry['type'] = directoryEntry.isDirectory()
        ? 'directory'
        : 'file'
      if (!directoryEntry.isDirectory() && !directoryEntry.isFile()) {
        continue
      }

      const absolutePath = path.join(current, directoryEntry.name)
      const relativePath = toPosixPath(path.relative(absoluteRoot, absolutePath))
      let stats
      try {
        stats = await fs.lstat(absolutePath)
      } catch {
        continue
      }

      entries.push({
        path: relativePath,
        name: directoryEntry.name,
        type: entryType,
        size: entryType === 'file' ? stats.size : undefined,
      })

      if (
        entryType === 'directory' &&
        !isIgnoredDirectory(directoryEntry.name)
      ) {
        childDirectories.push(absolutePath)
      }
    }

    for (const childDirectory of childDirectories) {
      if (entries.length >= MAX_LISTED_FILES) {
        return
      }
      await walk(childDirectory, depth + 1)
    }
  }

  await walk(absoluteRoot, 0)
  return entries
}

async function readRealPathKey(directoryPath: string) {
  try {
    return normalizePathKey(await fs.realpath(directoryPath))
  } catch {
    return normalizePathKey(directoryPath)
  }
}

function normalizePathKey(value: string) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isIgnoredDirectory(name: string) {
  return IGNORED_DIRECTORIES.has(name.toLowerCase())
}

async function readWorkspaceFile(
  workspaceRoot: string,
  filePath: string,
): Promise<ReadFileResult> {
  const absolutePath = resolveInsideWorkspace(workspaceRoot, filePath)
  const stats = await fs.stat(absolutePath)

  if (!stats.isFile()) {
    throw new Error('只能读取文件，不能读取目录。')
  }

  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(`文件过大，当前限制为 ${MAX_FILE_BYTES} bytes。`)
  }

  return {
    path: toPosixPath(path.relative(path.resolve(workspaceRoot), absolutePath)),
    content: await fs.readFile(absolutePath, 'utf8'),
  }
}

async function writeWorkspaceFile(
  workspaceRoot: string,
  filePath: string,
  content: string,
  actor: string,
): Promise<WriteFileResult> {
  const absolutePath = resolveInsideWorkspace(workspaceRoot, filePath)
  const absoluteRoot = path.resolve(workspaceRoot)
  const relativePath = toPosixPath(path.relative(absoluteRoot, absolutePath))
  const before = fsSync.existsSync(absolutePath)
    ? await fs.readFile(absolutePath, 'utf8')
    : ''

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, content, 'utf8')

  const diff = createTwoFilesPatch(
    `${relativePath} before`,
    `${relativePath} after`,
    before,
    content,
    '',
    '',
    { context: 3 },
  )

  await appendAuditLog({
    actor,
    type: 'write_file',
    workspaceRoot: absoluteRoot,
    path: relativePath,
    diff,
  })

  return {
    path: relativePath,
    diff,
  }
}

async function createWorkspaceFile(
  workspaceRoot: string,
  filePath: string,
): Promise<CreateEntryResult> {
  const cleanPath = normalizeNewEntryPath(filePath, '文件路径')
  const absolutePath = resolveInsideWorkspace(workspaceRoot, cleanPath)
  const absoluteRoot = path.resolve(workspaceRoot)
  const relativePath = toPosixPath(path.relative(absoluteRoot, absolutePath))

  if (fsSync.existsSync(absolutePath)) {
    throw new Error(`文件已存在：${relativePath}`)
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, '', 'utf8')
  await appendAuditLog({
    actor: 'user',
    type: 'create_file',
    workspaceRoot: absoluteRoot,
    path: relativePath,
  })

  return {
    path: relativePath,
    type: 'file',
  }
}

async function createWorkspaceDirectory(
  workspaceRoot: string,
  directoryPath: string,
): Promise<CreateEntryResult> {
  const cleanPath = normalizeNewEntryPath(directoryPath, '文件夹路径')
  const absolutePath = resolveInsideWorkspace(workspaceRoot, cleanPath)
  const absoluteRoot = path.resolve(workspaceRoot)
  const relativePath = toPosixPath(path.relative(absoluteRoot, absolutePath))

  if (fsSync.existsSync(absolutePath)) {
    throw new Error(`文件夹已存在：${relativePath}`)
  }

  await fs.mkdir(absolutePath, { recursive: true })
  await appendAuditLog({
    actor: 'user',
    type: 'create_directory',
    workspaceRoot: absoluteRoot,
    path: relativePath,
  })

  return {
    path: relativePath,
    type: 'directory',
  }
}

function normalizeNewEntryPath(requestedPath: string, label: string) {
  const cleanPath = requestedPath.trim().replace(/^[/\\]+/u, '')
  if (!cleanPath) {
    throw new Error(`${label}不能为空。`)
  }
  if (cleanPath.endsWith('/') || cleanPath.endsWith('\\')) {
    return cleanPath.slice(0, -1)
  }
  return cleanPath
}

function resolveInsideWorkspace(workspaceRoot: string, requestedPath: string) {
  const absoluteRoot = path.resolve(workspaceRoot)
  const normalizedRequest = requestedPath.replaceAll('/', path.sep)
  const absolutePath = path.resolve(absoluteRoot, normalizedRequest)
  const relativePath = path.relative(absoluteRoot, absolutePath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('路径超出了当前工作区，已拒绝访问。')
  }

  return absolutePath
}

async function runWorkspaceCommand(
  request: CommandRequest,
): Promise<CommandResult> {
  const workspaceRoot = path.resolve(request.workspaceRoot)
  const safety = classifyCommand(request.command)

  if (!safety.safe && !request.confirmed) {
    return {
      command: request.command,
      safe: false,
      requiresConfirmation: true,
      reason: safety.reason,
    }
  }

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', request.command],
      {
        cwd: workspaceRoot,
        windowsHide: true,
      },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      stdout = limitOutput(stdout)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
      stderr = limitOutput(stderr)
    })

    child.on('error', (error) => {
      resolve({
        command: request.command,
        safe: safety.safe,
        requiresConfirmation: false,
        reason: error.message,
        exitCode: 1,
        stdout,
        stderr,
      })
    })

    child.on('close', async (exitCode) => {
      const result: CommandResult = {
        command: request.command,
        safe: safety.safe,
        requiresConfirmation: false,
        reason: safety.reason,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      }

      await appendAuditLog({
        actor: 'command',
        type: 'run_command',
        workspaceRoot,
        command: request.command,
        exitCode: result.exitCode,
      })

      resolve(result)
    })
  })
}

async function openFilesystemPath(targetPath: string): Promise<OpenPathResult> {
  const trimmedPath = targetPath.trim()
  if (!trimmedPath) {
    return {
      ok: false,
      message: 'Path is empty.',
    }
  }

  const requestedPath = path.resolve(trimmedPath)
  let existingPath = requestedPath
  while (!fsSync.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath)
    if (parentPath === existingPath) {
      return {
        ok: false,
        message: `Path does not exist: ${requestedPath}`,
      }
    }
    existingPath = parentPath
  }

  const errorMessage = await shell.openPath(existingPath)
  if (errorMessage) {
    return {
      ok: false,
      openedPath: existingPath,
      message: errorMessage,
    }
  }

  return {
    ok: true,
    openedPath: existingPath,
    message:
      existingPath === requestedPath
        ? undefined
        : `Target is not created yet. Opened nearest folder: ${existingPath}`,
  }
}

function classifyCommand(command: string): { safe: boolean; reason: string } {
  const trimmed = command.trim()

  if (!trimmed) {
    return { safe: false, reason: '命令为空。' }
  }

  const riskyTokens = /[;&|<>`]|\$\(|\brm\b|\bdel\b|\berase\b|\bRemove-Item\b/i
  const riskyGit = /\bgit\s+(push|commit|reset|checkout|clean|rebase|merge)\b/i
  const riskyNetwork = /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b/i
  const installCommand = /\b(npm|pnpm|yarn)\s+(install|add|remove|update|audit|exec|dlx)\b/i

  if (
    riskyTokens.test(trimmed) ||
    riskyGit.test(trimmed) ||
    riskyNetwork.test(trimmed) ||
    installCommand.test(trimmed)
  ) {
    return {
      safe: false,
      reason: '命令包含删除、联网、安装依赖、管道/重定向或高风险 git 操作。',
    }
  }

  const safePatterns = [
    /^(npm|pnpm|yarn)\s+(run\s+)?(test|build|lint|typecheck)(\s+[\w:.-]+)?$/i,
    /^git\s+(status|diff|log|show)(\s+[\w:./@{}=-]+)?$/i,
    /^rg(\s+[\w\s:./*"'=-]+)?$/i,
    /^(dir|ls)(\s+[\w\s:./*"'=-]+)?$/i,
    /^Get-ChildItem(\s+[\w\s:./*"'=-]+)?$/i,
  ]

  if (safePatterns.some((pattern) => pattern.test(trimmed))) {
    return { safe: true, reason: '匹配自动执行安全命令白名单。' }
  }

  return {
    safe: false,
    reason: '命令不在自动执行白名单内，需要用户确认。',
  }
}

async function listProviderProfiles(): Promise<ProviderProfile[]> {
  const store = await readSecureStore()
  const profiles = ensureProviderProfiles(store)
  await writeSecureStore(store)
  return profiles.map(toPublicProfile)
}

async function saveProviderProfile(
  input: ProviderProfileInput,
): Promise<ProviderProfile> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统安全存储不可用，无法保存 API Key。')
  }

  const store = await readSecureStore()
  const profiles = ensureProviderProfiles(store)
  const id = input.id || crypto.randomUUID()
  const existing = profiles.find((profile) => profile.id === id)
  const trimmedKey = input.apiKey?.trim()

  const nextProfile: StoredProviderProfile = {
    id,
    name: input.name.trim() || '未命名中转',
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    defaultModel: input.defaultModel.trim() || 'gpt-4o-mini',
    models: normalizeModels(input.models, input.defaultModel),
    protocol: input.protocol,
    reasoningEffort: input.reasoningEffort,
    disableResponseStorage: input.disableResponseStorage,
    requiresOpenAiAuth: input.requiresOpenAiAuth,
    encryptedApiKey: trimmedKey
      ? safeStorage.encryptString(trimmedKey).toString('base64')
      : existing?.encryptedApiKey,
  }

  if (!nextProfile.baseUrl) {
    throw new Error('Base URL 不能为空。')
  }

  store.profiles = [
    ...profiles.filter((profile) => profile.id !== id),
    nextProfile,
  ]

  await writeSecureStore(store)
  return toPublicProfile(nextProfile)
}

async function deleteProviderProfile(id: string): Promise<ProviderProfile[]> {
  const store = await readSecureStore()
  const profiles = ensureProviderProfiles(store).filter(
    (profile) => profile.id !== id,
  )
  store.profiles = profiles
  await writeSecureStore(store)
  return profiles.map(toPublicProfile)
}

async function searchProviderModels(
  input: ProviderProfileInput,
): Promise<ProviderModelInfo[]> {
  const { profile, apiKey } = await resolveDraftProfileForNetwork(input)
  const response = await fetch(buildProviderEndpoint(profile.baseUrl, 'models'), {
    method: 'GET',
    headers: buildProviderHeaders(apiKey, profile),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(readApiErrorText(text, `${profile.name} 模型列表请求失败。`))
  }

  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error(`${profile.name} 模型列表不是合法 JSON。`)
  }

  const models = readProviderModelList(data)
  if (models.length === 0) {
    throw new Error(`${profile.name} 没有返回可用模型。`)
  }

  return models
}

async function testProviderModel(
  input: ProviderProfileInput,
): Promise<ProviderModelTestResult> {
  const { profile, apiKey } = await resolveDraftProfileForNetwork(input)
  const model = profile.defaultModel.trim()

  if (!model) {
    throw new Error('默认模型不能为空。')
  }

  const startedAt = Date.now()
  try {
    if (profile.protocol === 'responses') {
      await testOpenAiResponsesModel(profile, apiKey, model)
    } else {
      await testOpenAiCompatibleModel(profile, apiKey, model)
    }

    return {
      ok: true,
      model,
      latencyMs: Date.now() - startedAt,
      message: `${profile.name} / ${model} 测试通过。`,
    }
  } catch (error) {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - startedAt,
      message: readNetworkError(error),
    }
  }
}

async function getImageGenerationConfig(): Promise<ImageGenerationConfig> {
  const store = await readSecureStore()
  const config = normalizeStoredImageConfig(store.imageGeneration)
  store.imageGeneration = config
  await writeSecureStore(store)
  return toPublicImageConfig(config)
}

async function saveImageGenerationConfig(
  input: ImageGenerationConfigInput,
): Promise<ImageGenerationConfig> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统安全存储不可用，无法保存图像 API Key。')
  }

  const store = await readSecureStore()
  const existing = normalizeStoredImageConfig(store.imageGeneration)
  const trimmedKey = input.apiKey?.trim()
  const config: StoredImageGenerationConfig = {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim() || 'gpt-image-1',
    size: input.size.trim() || '1024x1024',
    quality: input.quality.trim() || 'auto',
    promptProfileId: input.promptProfileId,
    promptModel: input.promptModel.trim(),
    requiresOpenAiAuth: input.requiresOpenAiAuth,
    encryptedApiKey: trimmedKey
      ? safeStorage.encryptString(trimmedKey).toString('base64')
      : existing.encryptedApiKey,
  }

  if (!config.baseUrl) {
    throw new Error('图像 Base URL 不能为空。')
  }

  store.imageGeneration = config
  await writeSecureStore(store)
  return toPublicImageConfig(config)
}

async function buildImagePrompt(request: ImagePromptRequest): Promise<string> {
  const source = request.source.trim()
  if (!source) {
    throw new Error('请先输入要生成的画面。')
  }

  if (!request.config.promptProfileId || !request.config.promptModel) {
    return buildImagePromptByRules(source)
  }

  const { profile, apiKey } = await getResolvedProfile(request.config.promptProfileId)
  const text = await callProvider(
    apiKey,
    profile,
    {
      config: {
        profileId: request.config.promptProfileId,
        model: request.config.promptModel,
        reasoningEffort: profile.reasoningEffort ?? 'medium',
        disableResponseStorage: profile.disableResponseStorage ?? false,
        temperature: 0.4,
        maxOutputTokens: 900,
      },
      messages: [],
    },
    [
      {
        role: 'system',
        content: [
          '你是图像生成提示词设计师。',
          '把用户的中文需求改写成可直接用于图像生成模型的中文提示词。',
          '输出一段完整提示词，不要解释，不要 markdown。',
          '必须包含主体、环境、构图、光线、色彩、风格、细节、质量要求。',
          '避免血腥、色情、仇恨、违法和真实名人肖像要求。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: source,
      },
    ],
  )

  return text.trim() || buildImagePromptByRules(source)
}

async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const prompt = request.prompt.trim()
  if (!prompt) {
    throw new Error('生图提示词不能为空。')
  }

  const { config, apiKey } = await resolveImageConfigForNetwork(request.config)
  const body: Record<string, unknown> = {
    model: config.model,
    prompt,
    n: 1,
    size: config.size,
  }

  if (config.quality && config.quality !== 'auto') {
    body.quality = config.quality
  }

  const response = await fetch(buildProviderEndpoint(config.baseUrl, 'images/generations'), {
    method: 'POST',
    headers: buildImageHeaders(apiKey, config),
    body: JSON.stringify(body),
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(readApiErrorText(text, '图像生成请求失败。'))
  }

  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    throw new Error('图像生成返回不是合法 JSON。')
  }

  const result = await readImageGenerationResult(data)
  return {
    prompt,
    ...result,
    message: '图像生成完成。',
  }
}

async function testOpenAiResponsesModel(
  profile: StoredProviderProfile,
  apiKey: string,
  model: string,
) {
  const body: Record<string, unknown> = {
    model,
    input: '请只回复 OK',
    max_output_tokens: 16,
  }

  if (profile.disableResponseStorage) {
    body.store = false
  }

  const response = await fetch(buildProviderEndpoint(profile.baseUrl, 'responses'), {
    method: 'POST',
    headers: buildProviderHeaders(apiKey, profile),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      readApiErrorText(await response.text(), `${profile.name} 模型测试失败。`),
    )
  }
}

async function testOpenAiCompatibleModel(
  profile: StoredProviderProfile,
  apiKey: string,
  model: string,
) {
  const response = await fetch(
    buildProviderEndpoint(profile.baseUrl, 'chat/completions'),
    {
      method: 'POST',
      headers: buildProviderHeaders(apiKey, profile),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复 OK' }],
        max_tokens: 16,
        temperature: 0,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      readApiErrorText(await response.text(), `${profile.name} 模型测试失败。`),
    )
  }
}

function buildImagePromptByRules(source: string) {
  return [
    `主题：${source}`,
    '画面要求：主体明确，环境细节丰富，空间层次清晰，构图稳定，有明确前景、中景和背景。',
    '视觉风格：高质量写实摄影感，真实光影，自然色彩，细节精致，画面干净。',
    '镜头与光线：中景构图，柔和自然光，细腻明暗过渡，避免过曝和杂乱背景。',
    '质量要求：高清，丰富纹理，专业视觉呈现，无文字水印，无畸形结构。',
  ].join('\n')
}

function normalizeStoredImageConfig(
  config?: StoredImageGenerationConfig,
): StoredImageGenerationConfig {
  return {
    baseUrl: normalizeBaseUrl(config?.baseUrl || 'https://api.openai.com/v1'),
    model: config?.model || 'gpt-image-1',
    size: config?.size || '1024x1024',
    quality: config?.quality || 'auto',
    promptProfileId: config?.promptProfileId || '',
    promptModel: config?.promptModel || '',
    requiresOpenAiAuth: config?.requiresOpenAiAuth ?? true,
    encryptedApiKey: config?.encryptedApiKey,
  }
}

function toPublicImageConfig(
  config: StoredImageGenerationConfig,
): ImageGenerationConfig {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    size: config.size,
    quality: config.quality,
    promptProfileId: config.promptProfileId,
    promptModel: config.promptModel,
    requiresOpenAiAuth: config.requiresOpenAiAuth,
    apiKeySet: Boolean(config.encryptedApiKey),
  }
}

async function resolveImageConfigForNetwork(input: ImageGenerationConfigInput) {
  const store = await readSecureStore()
  const existing = normalizeStoredImageConfig(store.imageGeneration)
  const trimmedKey = input.apiKey?.trim()
  const config: StoredImageGenerationConfig = {
    baseUrl: normalizeBaseUrl(input.baseUrl || existing.baseUrl),
    model: input.model.trim() || existing.model,
    size: input.size.trim() || existing.size,
    quality: input.quality.trim() || existing.quality,
    promptProfileId: input.promptProfileId || existing.promptProfileId,
    promptModel: input.promptModel.trim() || existing.promptModel,
    requiresOpenAiAuth: input.requiresOpenAiAuth,
    encryptedApiKey: trimmedKey
      ? safeStorage.encryptString(trimmedKey).toString('base64')
      : existing.encryptedApiKey,
  }

  if (!config.baseUrl) {
    throw new Error('图像 Base URL 不能为空。')
  }

  if (config.requiresOpenAiAuth && !config.encryptedApiKey) {
    throw new Error('图像生成需要 API Key，请先填写或保存图像 API Key。')
  }

  return {
    config,
    apiKey: config.encryptedApiKey
      ? safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'))
      : '',
  }
}

function buildImageHeaders(
  apiKey: string,
  config: StoredImageGenerationConfig,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.requiresOpenAiAuth && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

async function readImageGenerationResult(data: unknown) {
  if (!data || typeof data !== 'object') {
    throw new Error('图像生成返回为空。')
  }

  const record = data as Record<string, unknown>
  const items = Array.isArray(record.data) ? record.data : []
  const first = items[0] as Record<string, unknown> | undefined
  const b64Json = typeof first?.b64_json === 'string' ? first.b64_json : ''
  const url = typeof first?.url === 'string' ? first.url : ''
  const revisedPrompt =
    typeof first?.revised_prompt === 'string' ? first.revised_prompt : undefined

  if (b64Json) {
    return {
      imageUrl: await saveGeneratedImage(b64Json),
      revisedPrompt,
    }
  }

  if (url) {
    return {
      imageUrl: url,
      revisedPrompt,
    }
  }

  throw new Error('图像生成返回中没有图片 URL 或 b64_json。')
}

async function saveGeneratedImage(b64Json: string) {
  const imageDirectory = getGeneratedImageDirectory()
  await fs.mkdir(imageDirectory, { recursive: true })
  const fileName = `${Date.now()}-${crypto.randomUUID()}.png`
  const imagePath = path.join(imageDirectory, fileName)
  await fs.writeFile(imagePath, Buffer.from(b64Json, 'base64'))
  return `${GENERATED_IMAGE_PROTOCOL}://generated/${encodeURIComponent(fileName)}`
}

function getGeneratedImageDirectory() {
  return path.join(app.getPath('userData'), 'generated-images')
}

async function resolveDraftProfileForNetwork(input: ProviderProfileInput) {
  const store = await readSecureStore()
  const profiles = ensureProviderProfiles(store)
  const existing = input.id
    ? profiles.find((profile) => profile.id === input.id)
    : undefined
  const trimmedKey = input.apiKey?.trim()
  const encryptedApiKey = trimmedKey
    ? safeStorage.encryptString(trimmedKey).toString('base64')
    : existing?.encryptedApiKey
  const profile: StoredProviderProfile = {
    id: input.id || existing?.id || 'draft-profile',
    name: input.name.trim() || existing?.name || '未命名中转',
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl || existing?.baseUrl || ''),
    defaultModel:
      input.defaultModel.trim() || existing?.defaultModel || 'gpt-4o-mini',
    models: normalizeModels(input.models, input.defaultModel),
    protocol: input.protocol,
    reasoningEffort: input.reasoningEffort,
    disableResponseStorage: input.disableResponseStorage,
    requiresOpenAiAuth: input.requiresOpenAiAuth,
    encryptedApiKey,
  }

  if (!profile.baseUrl) {
    throw new Error('Base URL 不能为空。')
  }

  if (profile.requiresOpenAiAuth !== false && !profile.encryptedApiKey) {
    throw new Error('搜索模型需要 API Key，请先填写或保存 API Key。')
  }

  return {
    profile,
    apiKey: profile.encryptedApiKey
      ? safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64'))
      : '',
  }
}

async function getResolvedProfile(profileId: string) {
  const store = await readSecureStore()
  const profile = ensureProviderProfiles(store).find((item) => item.id === profileId)

  if (!profile) {
    throw new Error('当前供应商配置不存在，请在设置里重新选择。')
  }

  if (profile.requiresOpenAiAuth !== false && !profile.encryptedApiKey) {
    throw new Error('当前供应商配置还没有保存 API Key。')
  }

  return {
    profile,
    apiKey: profile.encryptedApiKey
      ? safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64'))
      : '',
  }
}

function ensureProviderProfiles(store: SecureStore): StoredProviderProfile[] {
  if (Array.isArray(store.profiles) && store.profiles.length > 0) {
    store.profiles = store.profiles.map(normalizeStoredProfile)
    const huiqingKey = store.profiles.find(
      (profile) =>
        profile.baseUrl === 'https://newapi.huiqing.cyou/v1' &&
        profile.encryptedApiKey,
    )?.encryptedApiKey
    const hasCustomHuiqing = store.profiles.some(
      (profile) => profile.id === 'custom-huiqing-responses',
    )
    if (!hasCustomHuiqing) {
      store.profiles.unshift(createHuiqingProfile(huiqingKey))
    } else {
      store.profiles = store.profiles.map((profile) =>
        profile.id === 'custom-huiqing-responses' &&
        !profile.encryptedApiKey &&
        huiqingKey
          ? { ...profile, encryptedApiKey: huiqingKey }
          : profile,
      )
    }
    return store.profiles
  }

  store.profiles = [
    createHuiqingProfile(store.openai),
    {
      id: 'openai-compatible',
      name: 'OpenAI 中转',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4.1-mini'],
      protocol: 'chat',
      reasoningEffort: 'medium',
      disableResponseStorage: false,
      requiresOpenAiAuth: true,
      encryptedApiKey: store.openai,
    },
    {
      id: 'deepseek-compatible',
      name: 'DeepSeek 中转',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      protocol: 'chat',
      reasoningEffort: 'medium',
      disableResponseStorage: false,
      requiresOpenAiAuth: true,
      encryptedApiKey: store.deepseek,
    },
  ]

  return store.profiles
}

function toPublicProfile(profile: StoredProviderProfile): ProviderProfile {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    defaultModel: profile.defaultModel,
    models: normalizeModels(profile.models, profile.defaultModel),
    protocol: profile.protocol,
    reasoningEffort: profile.reasoningEffort ?? 'medium',
    disableResponseStorage: profile.disableResponseStorage ?? false,
    requiresOpenAiAuth: profile.requiresOpenAiAuth ?? true,
    apiKeySet: Boolean(profile.encryptedApiKey),
  }
}

function createHuiqingProfile(encryptedApiKey?: string): StoredProviderProfile {
  return {
    id: 'custom-huiqing-responses',
    name: 'custom',
    provider: 'custom',
    baseUrl: 'https://newapi.huiqing.cyou/v1',
    defaultModel: 'gpt-5.4',
    models: ['gpt-5.4', 'gpt-5.5'],
    protocol: 'responses',
    reasoningEffort: 'high',
    disableResponseStorage: true,
    requiresOpenAiAuth: true,
    encryptedApiKey,
  }
}

function normalizeStoredProfile(
  profile: StoredProviderProfile,
): StoredProviderProfile {
  const defaultModel = profile.defaultModel || 'gpt-4o-mini'
  return {
    ...profile,
    baseUrl: normalizeBaseUrl(profile.baseUrl),
    defaultModel,
    models: normalizeModels(profile.models, defaultModel),
    reasoningEffort: profile.reasoningEffort ?? 'medium',
    disableResponseStorage: profile.disableResponseStorage ?? false,
    requiresOpenAiAuth: profile.requiresOpenAiAuth ?? true,
  }
}

function normalizeModels(models: string[] | undefined, defaultModel: string) {
  const uniqueModels = new Set(
    [...(models ?? []), defaultModel]
      .map((model) => model.trim())
      .filter(Boolean),
  )
  return Array.from(uniqueModels)
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/g, '')
}

async function readSecureStore(): Promise<SecureStore> {
  const storePath = getSecureStorePath()

  if (!fsSync.existsSync(storePath)) {
    return {}
  }

  const raw = await fs.readFile(storePath, 'utf8')
  const normalizedRaw = normalizeSecureStoreJson(raw)
  try {
    return JSON.parse(normalizedRaw) as SecureStore
  } catch {
    const repaired = repairSecureStore(normalizedRaw)
    const backupPath = `${storePath}.corrupt-${Date.now()}`
    await fs.writeFile(backupPath, raw, 'utf8')
    await writeSecureStore(repaired)
    return repaired
  }
}

async function writeSecureStore(store: SecureStore) {
  const storePath = getSecureStorePath()
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

function getSecureStorePath() {
  return path.join(app.getPath('userData'), 'secure-store.json')
}

function normalizeSecureStoreJson(raw: string) {
  return raw.replace(
    /"encryptedApiKey"\s*:\s*"([^"]*)"/gs,
    (_match, encryptedValue: string) =>
      `"encryptedApiKey":"${encryptedValue.replace(/\s+/g, '')}"`,
  )
}

function repairSecureStore(raw: string): SecureStore {
  const store: SecureStore = {}
  const firstObject = extractJsonObjectAt(raw, raw.indexOf('{'))
  if (firstObject) {
    try {
      Object.assign(store, JSON.parse(firstObject) as SecureStore)
    } catch {
      // Continue with partial recovery below.
    }
  }

  const imageKeyIndex = raw.indexOf('"imageGeneration"')
  if (imageKeyIndex >= 0) {
    const imageObjectStart = raw.indexOf('{', imageKeyIndex)
    const imageObject = extractJsonObjectAt(raw, imageObjectStart)
    if (imageObject) {
      try {
        store.imageGeneration = JSON.parse(imageObject) as StoredImageGenerationConfig
      } catch {
        // Ignore unrecoverable image config.
      }
    }
  }

  return store
}

function extractJsonObjectAt(source: string, startIndex: number) {
  if (startIndex < 0 || source[startIndex] !== '{') {
    return null
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

async function runAgentChat(
  request: ChatRequest,
  stream?: ChatStreamSink,
): Promise<ChatResponse> {
  const { profile, apiKey } = await getResolvedProfile(request.config.profileId)

  const providerMessages = await buildProviderMessages(request)
  const actions: AgentActionResult[] = []
  const message: ChatResponse['message'] = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
  }
  let finalText = ''

  stream?.emit({ type: 'start', message })

  const emitText = (content: string) => {
    if (stream && message.content !== content) {
      message.content = content
      stream.emit({ type: 'replace', messageId: message.id, content })
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let lastVisibleText = ''
    const rawText = await callProvider(
      apiKey,
      profile,
      request,
      providerMessages,
      stream
        ? (rawTextFragment) => {
            const visibleText = readVisibleStreamText(rawTextFragment)
            if (visibleText !== lastVisibleText) {
              lastVisibleText = visibleText
              emitText(visibleText)
            }
          }
        : undefined,
    )
    const envelope = parseAgentEnvelope(rawText)

    if (!envelope) {
      finalText = rawText
      emitText(finalText)
      break
    }

    finalText = envelope.message?.trim() || ''
    emitText(finalText)
    const requestedActions = envelope.actions ?? []

    if (requestedActions.length === 0 || envelope.done !== false) {
      break
    }

    const observations: string[] = []

    for (const action of requestedActions) {
      const result = await executeAgentAction(request, action)
      const { observation, ...publicResult } = result
      actions.push(publicResult)
      stream?.emit({ type: 'actions', actions: [...actions] })
      observations.push(
        observation ??
          `${publicResult.ok ? 'OK' : 'ERROR'} ${publicResult.summary}`,
      )
    }

    providerMessages.push({
      role: 'assistant',
      content: rawText,
    })
    providerMessages.push({
      role: 'user',
      content: [
        '工具执行结果如下，请继续完成任务。',
        '如果已经完成，请返回 done=true 且 actions=[]。',
        observations.join('\n'),
      ].join('\n'),
    })
  }

  message.content = finalText || '任务已处理，但模型没有返回可展示文本。'
  emitText(message.content)

  return {
    message,
    actions,
  }
}

async function buildProviderMessages(
  request: ChatRequest,
): Promise<ProviderMessage[]> {
  const workspaceSummary = request.workspaceRoot
    ? await createWorkspaceSummary(request.workspaceRoot)
    : '当前没有打开工作区。'

  return [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}\n\n${TOOL_PROTOCOL}\n\n${workspaceSummary}`,
    },
    ...request.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

async function createWorkspaceSummary(workspaceRoot: string) {
  const files = await listWorkspaceFiles(workspaceRoot)
  const fileLines = files
    .slice(0, 180)
    .map(
      (entry) => `${entry.type === 'directory' ? '[dir]' : '[file]'} ${entry.path}`,
    )
    .join('\n')

  return [
    `当前工作区: ${path.resolve(workspaceRoot)}`,
    '文件概览:',
    fileLines || '暂无可见文件。',
  ].join('\n')
}

async function executeAgentAction(
  request: ChatRequest,
  action: AgentAction,
): Promise<AgentActionExecutionResult> {
  if (!request.workspaceRoot) {
    return {
      type: action.type,
      ok: false,
      summary: '当前没有打开工作区，无法执行文件或命令操作。',
    }
  }

  try {
    if (action.type === 'read_file') {
      const result = await readWorkspaceFile(request.workspaceRoot, action.path)
      return {
        type: 'read_file',
        path: result.path,
        ok: true,
        summary: `读取 ${result.path}，${result.content.length} 个字符。`,
        observation: formatReadFileObservation(result),
      }
    }

    if (action.type === 'write_file') {
      const result = await writeWorkspaceFile(
        request.workspaceRoot,
        action.path,
        action.content,
        `ai:${request.config.profileId}:${request.config.model}`,
      )
      return {
        type: 'write_file',
        path: result.path,
        ok: true,
        summary: `写入 ${result.path}。`,
        diff: result.diff,
      }
    }

    const commandResult = await runWorkspaceCommand({
      workspaceRoot: request.workspaceRoot,
      command: action.command,
    })

    if (commandResult.requiresConfirmation) {
      return {
        type: 'run_command',
        command: action.command,
        ok: false,
        summary: `命令需要用户确认，未执行: ${commandResult.reason}`,
      }
    }

    return {
      type: 'run_command',
      command: action.command,
      ok: commandResult.exitCode === 0,
      summary: `执行 ${action.command}，退出码 ${commandResult.exitCode}。`,
    }
  } catch (error) {
    return {
      type: action.type,
      path: 'path' in action ? action.path : undefined,
      command: 'command' in action ? action.command : undefined,
      ok: false,
      summary: error instanceof Error ? error.message : '未知错误。',
    }
  }
}

function formatReadFileObservation(result: ReadFileResult) {
  const maxObservationChars = 80_000
  const content =
    result.content.length > maxObservationChars
      ? `${result.content.slice(0, maxObservationChars)}\n\n[文件内容已截断，原始长度 ${result.content.length} 个字符]`
      : result.content

  return [
    `OK 读取 ${result.path}，${result.content.length} 个字符。`,
    '文件内容如下：',
    '```',
    content,
    '```',
  ].join('\n')
}

async function callProvider(
  apiKey: string,
  profile: StoredProviderProfile,
  request: ChatRequest,
  messages: ProviderMessage[],
  onStreamText?: ProviderStreamHandler,
) {
  if (profile.protocol === 'responses') {
    return callOpenAiResponses(apiKey, profile, request, messages, onStreamText)
  }

  return callOpenAiCompatibleChat(apiKey, profile, request, messages, onStreamText)
}

async function callOpenAiResponses(
  apiKey: string,
  profile: StoredProviderProfile,
  request: ChatRequest,
  messages: ProviderMessage[],
  onStreamText?: ProviderStreamHandler,
) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
  const body: Record<string, unknown> = {
    model: request.config.model,
    instructions,
    input,
    temperature: request.config.temperature,
    max_output_tokens: request.config.maxOutputTokens,
    reasoning: {
      effort: request.config.reasoningEffort,
    },
  }

  if (onStreamText) {
    body.stream = true
  }

  if (request.config.disableResponseStorage) {
    body.store = false
  }

  const response = await fetch(buildProviderEndpoint(profile.baseUrl, 'responses'), {
    method: 'POST',
    headers: buildProviderHeaders(apiKey, profile),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      readApiErrorText(await response.text(), `${profile.name} 请求失败。`),
    )
  }

  if (onStreamText && isEventStream(response)) {
    return readOpenAiResponsesStream(response, onStreamText)
  }

  const data = (await response.json()) as Record<string, unknown>
  return readOpenAiText(data)
}

async function callOpenAiCompatibleChat(
  apiKey: string,
  profile: StoredProviderProfile,
  request: ChatRequest,
  messages: ProviderMessage[],
  onStreamText?: ProviderStreamHandler,
) {
  const body: Record<string, unknown> = {
    model: request.config.model,
    messages,
    temperature: request.config.temperature,
    max_tokens: request.config.maxOutputTokens,
    reasoning_effort: request.config.reasoningEffort,
  }

  if (onStreamText) {
    body.stream = true
  }

  if (request.config.disableResponseStorage) {
    body.store = false
  }

  const response = await fetch(
    buildProviderEndpoint(profile.baseUrl, 'chat/completions'),
    {
      method: 'POST',
      headers: buildProviderHeaders(apiKey, profile),
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw new Error(
      readApiErrorText(await response.text(), `${profile.name} 请求失败。`),
    )
  }

  if (onStreamText && isEventStream(response)) {
    return readOpenAiChatStream(response, onStreamText)
  }

  const data = (await response.json()) as Record<string, unknown>
  const choices = data.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0] as Record<string, unknown>
    const message = firstChoice.message as Record<string, unknown> | undefined
    if (typeof message?.content === 'string') {
      return message.content
    }
  }

  throw new Error(`${profile.name} 返回中没有可读取的文本。`)
}

function buildProviderHeaders(apiKey: string, profile: StoredProviderProfile) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (profile.requiresOpenAiAuth !== false && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

function readProviderModelList(data: unknown): ProviderModelInfo[] {
  const candidates = readModelCandidateArray(data)
  const models = new Map<string, ProviderModelInfo>()

  for (const item of candidates) {
    if (typeof item === 'string') {
      const id = item.trim()
      if (id) {
        models.set(id, { id })
      }
      continue
    }

    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const id =
      typeof record.id === 'string'
        ? record.id.trim()
        : typeof record.name === 'string'
          ? record.name.trim()
          : ''

    if (!id) {
      continue
    }

    models.set(id, {
      id,
      ownedBy:
        typeof record.owned_by === 'string'
          ? record.owned_by
          : typeof record.owner === 'string'
            ? record.owner
            : undefined,
    })
  }

  return Array.from(models.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  )
}

function readModelCandidateArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data
  }

  if (!data || typeof data !== 'object') {
    return []
  }

  const record = data as Record<string, unknown>
  if (Array.isArray(record.data)) {
    return record.data
  }

  if (Array.isArray(record.models)) {
    return record.models
  }

  return []
}

function buildProviderEndpoint(baseUrl: string, endpoint: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  const normalizedEndpoint = endpoint.replace(/^\/+/g, '')

  if (normalized.endsWith(normalizedEndpoint)) {
    return normalized
  }

  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}/${normalizedEndpoint}`
  }

  return `${normalized}/v1/${normalizedEndpoint}`
}

function readOpenAiText(data: Record<string, unknown>) {
  if (typeof data.output_text === 'string') {
    return data.output_text
  }

  const output = data.output
  if (!Array.isArray(output)) {
    throw new Error('OpenAI 返回中没有可读取的 output。')
  }

  const parts: string[] = []
  for (const item of output) {
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) {
      continue
    }

    for (const contentItem of content) {
      const record = contentItem as Record<string, unknown>
      if (typeof record.text === 'string') {
        parts.push(record.text)
      }
    }
  }

  if (parts.length === 0) {
    throw new Error('OpenAI 返回中没有可读取的文本。')
  }

  return parts.join('\n')
}

function readApiError(data: Record<string, unknown>, fallback: string) {
  const error = data.error as Record<string, unknown> | undefined
  return typeof error?.message === 'string' ? error.message : fallback
}

function readApiErrorText(text: string, fallback: string) {
  try {
    return readApiError(JSON.parse(text) as Record<string, unknown>, fallback)
  } catch {
    return text.trim() || fallback
  }
}

function readNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return `网络连接失败：${message}`
  }
  if (/401|unauthorized|invalid api key|incorrect api key/i.test(message)) {
    return `API Key 无效或无权限：${message}`
  }
  if (/404|not found|model/i.test(message)) {
    return `模型或接口不可用：${message}`
  }
  if (/quota|billing|insufficient|余额|额度|token/i.test(message)) {
    return `额度、Token 或计费异常：${message}`
  }
  return message
}

function isEventStream(response: Response) {
  return (
    response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') ??
    false
  )
}

async function readOpenAiResponsesStream(
  response: Response,
  onStreamText: ProviderStreamHandler,
) {
  let outputText = ''
  let completedText = ''

  await readServerSentEvents(response, (message) => {
    const parsed = parseStreamJson(message.data)
    if (!parsed) {
      return
    }

    const eventType =
      typeof parsed.type === 'string' ? parsed.type : message.event ?? ''

    if (
      eventType === 'response.output_text.delta' &&
      typeof parsed.delta === 'string'
    ) {
      outputText += parsed.delta
      onStreamText(outputText)
      return
    }

    if (eventType === 'response.completed') {
      const completedResponse = parsed.response
      if (completedResponse && typeof completedResponse === 'object') {
        try {
          completedText = readOpenAiText(
            completedResponse as Record<string, unknown>,
          )
        } catch {
          completedText = ''
        }
      }
    }
  })

  const finalText = outputText || completedText
  if (!finalText) {
    throw new Error('OpenAI 流式返回中没有可读取的文本。')
  }

  if (completedText && completedText !== outputText) {
    onStreamText(completedText)
  }

  return finalText
}

async function readOpenAiChatStream(
  response: Response,
  onStreamText: ProviderStreamHandler,
) {
  let outputText = ''

  await readServerSentEvents(response, (message) => {
    const parsed = parseStreamJson(message.data)
    if (!parsed) {
      return
    }

    const choices = parsed.choices
    if (!Array.isArray(choices)) {
      return
    }

    for (const choice of choices) {
      const choiceRecord = choice as Record<string, unknown>
      const delta = choiceRecord.delta as Record<string, unknown> | undefined
      const text = readChatDeltaText(delta)
      if (text) {
        outputText += text
        onStreamText(outputText)
      }
    }
  })

  if (!outputText) {
    throw new Error('OpenAI 兼容流式返回中没有可读取的文本。')
  }

  return outputText
}

function readChatDeltaText(delta: Record<string, unknown> | undefined) {
  if (!delta) {
    return ''
  }

  if (typeof delta.content === 'string') {
    return delta.content
  }

  if (Array.isArray(delta.content)) {
    return delta.content
      .map((part) => {
        const record = part as Record<string, unknown>
        return typeof record.text === 'string' ? record.text : ''
      })
      .join('')
  }

  return ''
}

async function readServerSentEvents(
  response: Response,
  onMessage: (message: SseMessage) => void,
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('流式响应没有可读取的 body。')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    let eventEnd = buffer.indexOf('\n\n')
    while (eventEnd >= 0) {
      const block = buffer.slice(0, eventEnd)
      buffer = buffer.slice(eventEnd + 2)
      const message = parseSseMessage(block)
      if (message) {
        onMessage(message)
      }
      eventEnd = buffer.indexOf('\n\n')
    }
  }

  buffer += decoder.decode()
  const message = parseSseMessage(buffer)
  if (message) {
    onMessage(message)
  }
}

function parseSseMessage(block: string): SseMessage | null {
  const lines = block.split('\n')
  const dataLines: string[] = []
  let event: string | undefined

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    const separator = line.indexOf(':')
    const field = separator >= 0 ? line.slice(0, separator) : line
    let value = separator >= 0 ? line.slice(separator + 1) : ''
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }

    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return { event, data: dataLines.join('\n') }
}

function parseStreamJson(data: string): Record<string, unknown> | null {
  if (data.trim() === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }
}

function readVisibleStreamText(rawText: string) {
  const candidate = rawText
    .trimStart()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')

  if (!candidate.startsWith('{') && !candidate.includes('"message"')) {
    return rawText
  }

  return readPartialJsonStringField(candidate, 'message') ?? ''
}

function readPartialJsonStringField(source: string, field: string) {
  const keyIndex = source.indexOf(`"${field}"`)
  if (keyIndex < 0) {
    return null
  }

  const colonIndex = source.indexOf(':', keyIndex + field.length + 2)
  if (colonIndex < 0) {
    return null
  }

  let cursor = colonIndex + 1
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }

  if (source[cursor] !== '"') {
    return null
  }

  cursor += 1
  let value = ''

  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor]
    if (char === '"') {
      return value
    }

    if (char !== '\\') {
      value += char
      continue
    }

    if (cursor + 1 >= source.length) {
      return value
    }

    const escaped = source[cursor + 1]
    if (escaped === 'u') {
      const hex = source.slice(cursor + 2, cursor + 6)
      if (hex.length < 4) {
        return value
      }
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        value += String.fromCharCode(Number.parseInt(hex, 16))
        cursor += 5
        continue
      }
    }

    value += decodeJsonEscape(escaped)
    cursor += 1
  }

  return value
}

function decodeJsonEscape(value: string) {
  if (value === 'n') {
    return '\n'
  }
  if (value === 'r') {
    return '\r'
  }
  if (value === 't') {
    return '\t'
  }
  if (value === 'b') {
    return '\b'
  }
  if (value === 'f') {
    return '\f'
  }
  return value
}

function parseAgentEnvelope(rawText: string): AgentEnvelope | null {
  const trimmed = rawText.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  const jsonTexts = extractCompleteJsonObjects(withoutFence)
  if (jsonTexts.length === 0) {
    return null
  }

  for (const jsonText of jsonTexts.toReversed()) {
    try {
      const parsed = JSON.parse(jsonText) as AgentEnvelope
      if (!Array.isArray(parsed.actions)) {
        parsed.actions = []
      }
      parsed.actions = parsed.actions.filter(isValidAgentAction)
      return parsed
    } catch {
      continue
    }
  }

  return null
}

function extractCompleteJsonObjects(source: string) {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char !== '}' || depth === 0) {
      continue
    }

    depth -= 1
    if (depth === 0 && start >= 0) {
      objects.push(source.slice(start, index + 1))
      start = -1
    }
  }

  return objects
}

function isValidAgentAction(action: unknown): action is AgentAction {
  if (!action || typeof action !== 'object') {
    return false
  }

  const record = action as Record<string, unknown>
  if (record.type === 'read_file') {
    return typeof record.path === 'string'
  }

  if (record.type === 'write_file') {
    return typeof record.path === 'string' && typeof record.content === 'string'
  }

  if (record.type === 'run_command') {
    return typeof record.command === 'string'
  }

  return false
}

async function appendAuditLog(record: Record<string, unknown>) {
  const auditPath = path.join(app.getPath('userData'), 'audit.jsonl')
  await fs.mkdir(path.dirname(auditPath), { recursive: true })
  await fs.appendFile(
    auditPath,
    `${JSON.stringify({ ...record, createdAt: new Date().toISOString() })}\n`,
    'utf8',
  )
}

function limitOutput(output: string) {
  const maxLength = 60_000
  if (output.length <= maxLength) {
    return output
  }
  return output.slice(output.length - maxLength)
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/')
}

const SYSTEM_PROMPT = `你是一个在本地 Windows 桌面应用中运行的 AI 编程助手。你的任务是帮助用户阅读、修改、调试和测试当前打开的代码项目。

规则：
1. 默认使用中文回复，代码、命令、错误信息保留原文。
2. 在修改代码前，先说明你要改哪些文件和原因。
3. 只操作用户当前选择的工作目录；不要访问无关目录。
4. 优先读取现有代码风格、框架、脚本和配置，再决定实现方式。
5. 可以直接修改文件，但每次修改必须生成清晰的结果摘要。
6. 可以自动执行安全命令，例如测试、构建、搜索、查看 git diff。
7. 对删除文件、移动文件、安装依赖、联网命令、git commit/push、批量格式化，必须先请求用户确认。
8. 遇到不确定需求时，先问一个关键问题；如果可以从代码中判断，就先读取代码。
9. 修复 bug 时，优先给出最小可行改动，并补充必要测试。
10. 最终回复必须包含：改了什么、涉及文件、验证结果、还剩什么风险。`

const TOOL_PROTOCOL = `你必须只返回 JSON，不要返回 Markdown。

JSON 格式：
{
  "message": "给用户看的中文回复",
  "done": true,
  "actions": []
}

如果需要使用工具，把 done 设为 false，并在 actions 中加入：
{ "type": "read_file", "path": "相对路径" }
{ "type": "write_file", "path": "相对路径", "content": "完整的新文件内容" }
{ "type": "run_command", "command": "npm run build" }

write_file 的 content 必须是完整文件内容，不要只给片段。路径必须是相对当前工作区的路径。`
