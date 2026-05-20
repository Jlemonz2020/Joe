import {
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Code2,
  Cpu,
  FileCode2,
  FolderOpen,
  ImagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import type {
  AgentActionResult,
  ChatMessage,
  FileEntry,
  ImageGenerationConfigInput,
  ImageGenerationResult,
  ProviderConfig,
  ProviderId,
  ProviderModelInfo,
  ProviderModelTestResult,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProtocol,
  ReasoningEffort,
  WorkspaceInfo,
} from '../shared/types'

type ViewMode = 'chat' | 'settings' | 'images' | 'models'
type CreateMode = 'file' | 'directory'
type SettingsPanel = 'base' | 'image'
type ResizeTarget = 'primary' | 'assistant'

type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children: FileTreeNode[]
}

type ImageTemplate = {
  id: string
  name: string
  config: ImageGenerationConfigInput
}

type GeneratedImageRecord = ImageGenerationResult & {
  id: string
  title: string
  source: string
  createdAt: string
}

type GoalProgressItem = {
  id: string
  title: string
  done: boolean
}

type GoalProgressState = {
  projectGoal: string
  items: GoalProgressItem[]
}

type PersistedAppState = {
  view?: ViewMode
  settingsPanel?: SettingsPanel
  workspaceRoot?: string
  recentWorkspaceRoots?: string[]
  selectedFile?: string
  openTabs?: string[]
  messages?: ChatMessage[]
  actions?: AgentActionResult[]
  input?: string
  config?: ProviderConfig
  imageTemplates?: ImageTemplate[]
  activeImageTemplateId?: string
  imageSource?: string
  imagePrompt?: string
  imageWorkflowStatus?: string
  imageResults?: GeneratedImageRecord[]
  selectedImage?: GeneratedImageRecord | null
  primarySidebarVisible?: boolean
  primarySidebarWidth?: number
  assistantSidebarWidth?: number
  goalProgress?: GoalProgressState
}

type AssistantConversationProps = {
  actions: AgentActionResult[]
  activeProfile?: ProviderProfile
  config: ProviderConfig
  input: string
  isSending: boolean
  messages: ChatMessage[]
  notice: string
  sendMessage: () => void
  setInput: (value: string) => void
  workspace: WorkspaceInfo | null
}

type ModelSelectProps = {
  activeProfile?: ProviderProfile
  config: ProviderConfig
  profiles: ProviderProfile[]
  createProfile: () => void
  editProfile: (profile: ProviderProfile) => void
  selectProfile: (profileId: string) => void
  setConfig: React.Dispatch<React.SetStateAction<ProviderConfig>>
}

const APP_STATE_KEY = 'hc-ai-assistant-state-v2'
const PRIMARY_SIDEBAR_DEFAULT_WIDTH = 280
const PRIMARY_SIDEBAR_MIN_WIDTH = 240
const PRIMARY_SIDEBAR_MAX_WIDTH = 360
const ASSISTANT_SIDEBAR_DEFAULT_WIDTH = 360
const ASSISTANT_SIDEBAR_MIN_WIDTH = 300
const ASSISTANT_SIDEBAR_MAX_WIDTH = 460

const providerLabels: Record<ProviderId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  custom: '自定义',
}

const protocolLabels: Record<ProviderProtocol, string> = {
  chat: 'Chat Completions',
  responses: 'Responses',
}

const reasoningLabels: Record<ReasoningEffort, string> = {
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
}

const emptyDraft: ProviderProfileInput = {
  name: 'custom',
  provider: 'custom',
  baseUrl: 'https://newapi.huiqing.cyou/v1',
  defaultModel: 'gpt-5.4',
  models: ['gpt-5.4', 'gpt-5.5'],
  protocol: 'responses',
  reasoningEffort: 'high',
  disableResponseStorage: true,
  requiresOpenAiAuth: true,
  apiKey: '',
}

const defaultConfig: ProviderConfig = {
  profileId: '',
  model: '',
  reasoningEffort: 'high',
  disableResponseStorage: true,
  temperature: 0.2,
  maxOutputTokens: 4096,
}

const defaultImageConfig: ImageGenerationConfigInput = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-1',
  size: '1024x1024',
  quality: 'auto',
  promptProfileId: '',
  promptModel: '',
  requiresOpenAiAuth: true,
  apiKey: '',
}

function createDefaultGoalProgress(): GoalProgressState {
  return {
    projectGoal: '',
    items: [
      { id: 'goal-step-1', title: '', done: false },
      { id: 'goal-step-2', title: '', done: false },
    ],
  }
}

function App() {
  const persistedState = useMemo(() => loadPersistedAppState(), [])
  const [view, setView] = useState<ViewMode>(persistedState.view ?? 'chat')
  const [primarySidebarVisible, setPrimarySidebarVisible] = useState(
    persistedState.primarySidebarVisible ?? true,
  )
  const [primarySidebarWidth, setPrimarySidebarWidth] = useState(
    persistedState.primarySidebarWidth ?? PRIMARY_SIDEBAR_DEFAULT_WIDTH,
  )
  const [assistantSidebarWidth, setAssistantSidebarWidth] = useState(
    persistedState.assistantSidebarWidth ?? ASSISTANT_SIDEBAR_DEFAULT_WIDTH,
  )
  const [resizingColumn, setResizingColumn] = useState<ResizeTarget | null>(null)
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>(
    persistedState.settingsPanel ?? 'base',
  )
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(
    persistedState.workspaceRoot
      ? { root: persistedState.workspaceRoot, files: [] }
      : null,
  )
  const [recentWorkspaceRoots, setRecentWorkspaceRoots] = useState<string[]>(
    () =>
      [
        ...(persistedState.workspaceRoot ? [persistedState.workspaceRoot] : []),
        ...(persistedState.recentWorkspaceRoots ?? []),
      ].filter((root, index, roots) => root && roots.indexOf(root) === index),
  )
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState(
    persistedState.selectedFile ?? '',
  )
  const [openTabs, setOpenTabs] = useState<string[]>(
    persistedState.openTabs ?? [],
  )
  const [fileContent, setFileContent] = useState('')
  const [fileStatus, setFileStatus] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [createPath, setCreatePath] = useState('')
  const [createError, setCreateError] = useState('')
  const [profiles, setProfiles] = useState<ProviderProfile[]>([])
  const [draft, setDraft] = useState<ProviderProfileInput>({ ...emptyDraft })
  const [config, setConfig] = useState<ProviderConfig>(
    persistedState.config ?? { ...defaultConfig },
  )
  const [imageConfig, setImageConfig] =
    useState<ImageGenerationConfigInput>({ ...defaultImageConfig })
  const [imageTemplates, setImageTemplates] = useState<ImageTemplate[]>(
    persistedState.imageTemplates ?? [],
  )
  const [activeImageTemplateId, setActiveImageTemplateId] = useState(
    persistedState.activeImageTemplateId ?? '',
  )
  const [notice, setNotice] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(
    persistedState.messages ?? [],
  )
  const [actions, setActions] = useState<AgentActionResult[]>(
    persistedState.actions ?? [],
  )
  const [input, setInput] = useState(persistedState.input ?? '')
  const [isSending, setIsSending] = useState(false)
  const [imageSource, setImageSource] = useState(
    persistedState.imageSource ?? '',
  )
  const [imagePrompt, setImagePrompt] = useState(
    persistedState.imagePrompt ?? '',
  )
  const [imageWorkflowStatus, setImageWorkflowStatus] = useState(
    persistedState.imageWorkflowStatus ?? '',
  )
  const [isImagePrompting, setIsImagePrompting] = useState(false)
  const [isImageGenerating, setIsImageGenerating] = useState(false)
  const [imageResults, setImageResults] = useState<GeneratedImageRecord[]>(
    persistedState.imageResults ?? [],
  )
  const [selectedImage, setSelectedImage] =
    useState<GeneratedImageRecord | null>(persistedState.selectedImage ?? null)
  const [goalProgress, setGoalProgress] = useState<GoalProgressState>(
    persistedState.goalProgress ?? createDefaultGoalProgress(),
  )

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === config.profileId),
    [config.profileId, profiles],
  )
  const currentFileName = selectedFile
    ? selectedFile.split('/').at(-1) || selectedFile
    : '对话'
  const lineCount = Math.max(fileContent.split('\n').length, 1)
  const hasRightSidebar = view === 'chat' || view === 'models' || view === 'images'
  const workbenchGridClassName = [
    'workbench-grid',
    primarySidebarVisible ? 'has-primary-sidebar' : 'no-primary-sidebar',
    hasRightSidebar ? 'has-right-sidebar' : 'no-right-sidebar',
    resizingColumn ? 'is-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const workbenchGridStyle = {
    '--primary-sidebar-width': `${primarySidebarWidth}px`,
    '--assistant-sidebar-width': `${assistantSidebarWidth}px`,
  } as CSSProperties
  const assistantConversation: AssistantConversationProps = {
    actions,
    activeProfile,
    config,
    input,
    isSending,
    messages,
    notice,
    sendMessage: () => void sendMessage(),
    setInput,
    workspace,
  }

  useEffect(() => {
    void loadProfiles()
    window.hcAgent
      .getImageGenerationConfig()
      .then((loaded) => setImageConfig(toImageDraft(loaded)))
      .catch((error: unknown) => setNotice(readError(error)))
    // Initial boot should not re-run when the active runtime config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!persistedState.workspaceRoot) {
      return
    }
    let cancelled = false

    async function restoreWorkspace() {
      try {
        const restoredFiles = await window.hcAgent.listFiles(
          persistedState.workspaceRoot ?? '',
        )
        if (cancelled) {
          return
        }
        setFiles(restoredFiles)
        setWorkspace((current) =>
          current
            ? { ...current, files: restoredFiles }
            : {
                root: persistedState.workspaceRoot ?? '',
                files: restoredFiles,
              },
        )
        if (persistedState.selectedFile) {
          const restoredFile = await window.hcAgent.readFile(
            persistedState.workspaceRoot ?? '',
            persistedState.selectedFile,
          )
          if (cancelled) {
            return
          }
          setSelectedFile(restoredFile.path)
          setFileContent(restoredFile.content)
          setFileStatus(`已恢复 ${restoredFile.path}`)
        }
      } catch (error) {
        if (!cancelled) {
          setFileStatus(readError(error))
        }
      }
    }

    void restoreWorkspace()

    return () => {
      cancelled = true
    }
  }, [persistedState])

  useEffect(() => {
    const snapshot: PersistedAppState = {
      view,
      settingsPanel,
      workspaceRoot: workspace?.root,
      recentWorkspaceRoots,
      selectedFile,
      openTabs,
      messages,
      actions,
      input,
      config,
      imageTemplates,
      activeImageTemplateId,
      imageSource,
      imagePrompt,
      imageWorkflowStatus,
      imageResults: imageResults.map(compactGeneratedImageRecord),
      selectedImage: selectedImage
        ? compactGeneratedImageRecord(selectedImage)
        : selectedImage,
      primarySidebarVisible,
      primarySidebarWidth,
      assistantSidebarWidth,
      goalProgress,
    }

    try {
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(snapshot))
    } catch {
      // Local persistence is best-effort; the app should keep working without it.
    }
  }, [
    actions,
    activeImageTemplateId,
    config,
    goalProgress,
    imageTemplates,
    imagePrompt,
    imageResults,
    imageSource,
    imageWorkflowStatus,
    input,
    messages,
    openTabs,
    assistantSidebarWidth,
    primarySidebarVisible,
    primarySidebarWidth,
    recentWorkspaceRoots,
    selectedFile,
    selectedImage,
    settingsPanel,
    view,
    workspace?.root,
  ])

  async function loadProfiles() {
    const loaded = await window.hcAgent.listProviderProfiles()
    setProfiles(loaded)
    const preferred =
      loaded.find((profile) => profile.id === config.profileId) ?? loaded[0]

    if (!preferred) {
      setDraft({ ...emptyDraft })
      return
    }

    setDraft((current) => (current.id ? current : toDraft(preferred)))
    setConfig((current) => ({
      ...current,
      profileId: current.profileId || preferred.id,
      model: current.model || preferred.defaultModel,
      reasoningEffort: preferred.reasoningEffort,
      disableResponseStorage: preferred.disableResponseStorage,
    }))
  }

  async function selectWorkspace() {
    try {
      setFileStatus('正在读取工作区...')
      const selected = await window.hcAgent.selectWorkspace()
      if (!selected) {
        setFileStatus('')
        return
      }
      setWorkspace(selected)
      setFiles(selected.files)
      setSelectedFile('')
      setOpenTabs([])
      setFileContent('')
      setCreateMode(null)
      setCreateError('')
      showView('chat')
      rememberWorkspaceRoot(selected.root)
      setFileStatus(`已打开工作区：${selected.root}，${selected.files.length} 项`)
    } catch (error) {
      setFileStatus(readError(error))
      setNotice(readError(error))
    }
  }

  async function refreshFiles(root = workspace?.root) {
    if (!root) {
      return
    }
    try {
      const refreshedFiles = await window.hcAgent.listFiles(root)
      setFiles(refreshedFiles)
      setFileStatus(`已刷新工作区：${refreshedFiles.length} 项`)
    } catch (error) {
      setFileStatus(readError(error))
      setNotice(readError(error))
    }
  }

  async function openRecentWorkspace(root: string) {
    try {
      setFileStatus('正在读取工作区...')
      const refreshedFiles = await window.hcAgent.listFiles(root)
      setWorkspace({ root, files: refreshedFiles })
      setFiles(refreshedFiles)
      setSelectedFile('')
      setOpenTabs([])
      setFileContent('')
      setCreateMode(null)
      setCreateError('')
      showView('chat')
      rememberWorkspaceRoot(root)
      setFileStatus(`已打开工作区：${root}，${refreshedFiles.length} 项`)
    } catch (error) {
      setFileStatus(readError(error))
      setNotice(readError(error))
    }
  }

  function rememberWorkspaceRoot(root: string) {
    if (!root) {
      return
    }
    setRecentWorkspaceRoots((current) =>
      [root, ...current.filter((item) => item !== root)].slice(0, 8),
    )
  }

  async function openFile(filePath: string) {
    if (!workspace) {
      return
    }
    try {
      const result = await window.hcAgent.readFile(workspace.root, filePath)
      setSelectedFile(result.path)
      setOpenTabs((current) =>
        current.includes(result.path) ? current : [...current, result.path],
      )
      setFileContent(result.content)
      setFileStatus(`已读取 ${result.path}`)
    } catch (error) {
      setFileStatus(readError(error))
    }
  }

  async function saveFile() {
    if (!workspace || !selectedFile) {
      return
    }
    try {
      await window.hcAgent.writeFile(workspace.root, selectedFile, fileContent)
      setFileStatus(`已保存 ${selectedFile}`)
      await refreshFiles()
    } catch (error) {
      setFileStatus(readError(error))
    }
  }

  function closeTab(filePath: string) {
    setOpenTabs((current) => current.filter((item) => item !== filePath))
    if (selectedFile !== filePath) {
      return
    }
    const next = openTabs.filter((item) => item !== filePath).at(-1)
    if (next) {
      void openFile(next)
      return
    }
    setSelectedFile('')
    setFileContent('')
    setFileStatus('')
  }

  async function createEntry() {
    if (!workspace || !createMode) {
      return
    }
    const nextPath = createPath.trim()
    if (!nextPath) {
      setCreateError('请输入路径。')
      return
    }
    try {
      const result =
        createMode === 'file'
          ? await window.hcAgent.createFile(workspace.root, nextPath)
          : await window.hcAgent.createDirectory(workspace.root, nextPath)
      setCreatePath('')
      setCreateMode(null)
      setCreateError('')
      setFileStatus(`已创建 ${result.path}`)
      await refreshFiles()
      if (result.type === 'file') {
        await openFile(result.path)
      }
    } catch (error) {
      setCreateError(readError(error))
    }
  }

  function selectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId)
    setConfig((current) => ({
      ...current,
      profileId,
      model: profile?.defaultModel || current.model,
      reasoningEffort: profile?.reasoningEffort ?? current.reasoningEffort,
      disableResponseStorage:
        profile?.disableResponseStorage ?? current.disableResponseStorage,
    }))
  }

  function editProfile(profile: ProviderProfile) {
    setDraft(toDraft(profile))
    setSettingsPanel('base')
    showView('settings')
  }

  function createProfile() {
    setDraft({ ...emptyDraft })
    setSettingsPanel('base')
    showView('settings')
  }

  async function saveProfile() {
    try {
      const saved = await window.hcAgent.saveProviderProfile(draft)
      await loadProfiles()
      setDraft(toDraft(saved))
      setConfig((current) => ({
        ...current,
        profileId: saved.id,
        model: saved.defaultModel,
        reasoningEffort: saved.reasoningEffort,
        disableResponseStorage: saved.disableResponseStorage,
      }))
      setNotice(`${saved.name} 已保存`)
    } catch (error) {
      setNotice(readError(error))
    }
  }

  async function deleteProfile() {
    if (!draft.id) {
      createProfile()
      return
    }
    try {
      const latest = await window.hcAgent.deleteProviderProfile(draft.id)
      setProfiles(latest)
      const next = latest[0]
      setDraft(next ? toDraft(next) : { ...emptyDraft })
      setConfig((current) => ({
        ...current,
        profileId: next?.id ?? '',
        model: next?.defaultModel ?? '',
        reasoningEffort: next?.reasoningEffort ?? 'high',
        disableResponseStorage: next?.disableResponseStorage ?? true,
      }))
      setNotice('配置已删除')
    } catch (error) {
      setNotice(readError(error))
    }
  }

  async function saveImageConfig() {
    try {
      const saved = await window.hcAgent.saveImageGenerationConfig(imageConfig)
      const savedDraft = toImageDraft(saved)
      setImageConfig(savedDraft)
      setImageTemplates((current) =>
        current.map((template) =>
          template.id === activeImageTemplateId
            ? { ...template, config: savedDraft }
            : template,
        ),
      )
      setNotice('图像配置已保存')
    } catch (error) {
      setNotice(readError(error))
    }
  }

  function createImageTemplate() {
    const template: ImageTemplate = {
      id: crypto.randomUUID(),
      name: `图像模板 ${imageTemplates.length + 1}`,
      config: { ...imageConfig, apiKey: '' },
    }
    setImageTemplates((current) => [template, ...current])
    setActiveImageTemplateId(template.id)
    setSettingsPanel('image')
    setImageConfig(template.config)
    showView('settings')
  }

  function selectImageTemplate(template: ImageTemplate) {
    setActiveImageTemplateId(template.id)
    setSettingsPanel('image')
    setImageConfig({ ...template.config, apiKey: '' })
  }

  function updateImageTemplateName(name: string) {
    setImageTemplates((current) =>
      current.map((template) =>
        template.id === activeImageTemplateId
          ? { ...template, name: name.trim() || template.name }
          : template,
      ),
    )
  }

  async function buildImagePrompt(source: string) {
    return window.hcAgent.buildImagePrompt({ source, config: imageConfig })
  }

  async function generateImage(prompt: string, source: string) {
    const result = await window.hcAgent.generateImage({
      prompt,
      config: imageConfig,
    })
    const record: GeneratedImageRecord = {
      ...result,
      id: crypto.randomUUID(),
      imageUrl: normalizeGeneratedImageUrl(result.imageUrl),
      title: extractImageTitle(source, prompt),
      source,
      createdAt: new Date().toISOString(),
    }
    setImageResults((current) => [record, ...current])
    setSelectedImage(record)
    return record
  }

  async function refreshAfterAgentWork() {
    await refreshFiles()
    if (selectedFile) {
      await openFile(selectedFile)
    }
  }

  function showView(nextView: ViewMode) {
    setView(nextView)
    setPrimarySidebarVisible(true)
  }

  function togglePrimarySidebar(nextView: ViewMode) {
    if (view === nextView && primarySidebarVisible) {
      setPrimarySidebarVisible(false)
      return
    }
    showView(nextView)
  }

  function startColumnResize(
    target: ResizeTarget,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()

    const startX = event.clientX
    const startWidth =
      target === 'primary' ? primarySidebarWidth : assistantSidebarWidth

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      const delta = moveEvent.clientX - startX
      if (target === 'primary') {
        setPrimarySidebarWidth(
          clampNumber(
            startWidth + delta,
            PRIMARY_SIDEBAR_MIN_WIDTH,
            PRIMARY_SIDEBAR_MAX_WIDTH,
          ),
        )
        return
      }

      setAssistantSidebarWidth(
        clampNumber(
          startWidth - delta,
          ASSISTANT_SIDEBAR_MIN_WIDTH,
          ASSISTANT_SIDEBAR_MAX_WIDTH,
        ),
      )
    }

    function stopColumnResize() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopColumnResize)
      window.removeEventListener('pointercancel', stopColumnResize)
      setResizingColumn(null)
    }

    setResizingColumn(target)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopColumnResize)
    window.addEventListener('pointercancel', stopColumnResize)
  }

  async function sendMessage() {
    const content = input.trim()
    if (!content || isSending) {
      return
    }
    if (!activeProfile) {
      setNotice('请先创建或选择模型配置。')
      showView('settings')
      return
    }
    if (activeProfile.requiresOpenAiAuth !== false && !activeProfile.apiKeySet) {
      setNotice('请先在设置里保存 API Key。')
      showView('settings')
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    const nextMessages = [...messages, userMessage]
    let assistantMessageId = ''

    setMessages(nextMessages)
    setInput('')
    setActions([])
    setIsSending(true)

    try {
      const response = await window.hcAgent.chatStream(
        {
          config,
          messages: nextMessages,
          workspaceRoot: workspace?.root,
        },
        (event) => {
          if (event.type === 'start') {
            assistantMessageId = event.message.id
            setMessages((current) => upsertMessage(current, event.message))
          }
          if (event.type === 'replace') {
            setMessages((current) =>
              current.map((message) =>
                message.id === event.messageId
                  ? { ...message, content: event.content }
                  : message,
              ),
            )
          }
          if (event.type === 'actions') {
            setActions(event.actions)
            if (
              event.actions.some(
                (action) => action.type === 'write_file' && action.ok,
              )
            ) {
              void refreshAfterAgentWork()
            }
          }
        },
      )
      setMessages((current) => upsertMessage(current, response.message))
      setActions(response.actions)
      await refreshAfterAgentWork()
    } catch (error) {
      const message: ChatMessage = {
        id: assistantMessageId || crypto.randomUUID(),
        role: 'assistant',
        content: readError(error),
        createdAt: new Date().toISOString(),
      }
      setMessages((current) => upsertMessage(current, message))
      await refreshAfterAgentWork()
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main
      className={`workbench ${view === 'settings' ? 'settings-mode' : ''}`}
    >
      <header className="workbench-titlebar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Bot size={18} />
          </span>
          <span className="brand-copy">
            <strong>HC AI</strong>
            <small>编程助手</small>
          </span>
        </div>
        <button
          className="command-center"
          type="button"
          onClick={() => void selectWorkspace()}
        >
          <Search size={15} />
          <span>{workspace?.root ?? '打开工作区'}</span>
        </button>
        <div className="titlebar-meta">
          <span>{activeProfile?.name ?? '未配置'}</span>
          <span>{config.model || '-'}</span>
        </div>
      </header>

      <div className={workbenchGridClassName} style={workbenchGridStyle}>
        <ActivityBar
          primarySidebarVisible={primarySidebarVisible}
          view={view}
          setView={togglePrimarySidebar}
        />
        {primarySidebarVisible ? (
          view === 'settings' ? (
            <SettingsSidebar
              draft={draft}
              imageConfig={imageConfig}
              imageTemplates={imageTemplates}
              activeImageTemplateId={activeImageTemplateId}
              profiles={profiles}
              settingsPanel={settingsPanel}
              onCreate={createProfile}
              onCreateImageTemplate={createImageTemplate}
              onEdit={editProfile}
              onSelectImageTemplate={selectImageTemplate}
              setSettingsPanel={setSettingsPanel}
            />
          ) : view === 'images' ? (
            <ImageSidebar
              imageConfig={imageConfig}
              buildImagePrompt={buildImagePrompt}
              generateImage={generateImage}
              isGenerating={isImageGenerating}
              isPrompting={isImagePrompting}
              prompt={imagePrompt}
              setIsGenerating={setIsImageGenerating}
              setIsPrompting={setIsImagePrompting}
              setPrompt={setImagePrompt}
              setSource={setImageSource}
              setStatus={setImageWorkflowStatus}
              source={imageSource}
              status={imageWorkflowStatus}
            />
          ) : view === 'models' ? (
            <ModelSelectSidebar
              activeProfile={activeProfile}
              config={config}
              profiles={profiles}
              createProfile={createProfile}
              editProfile={editProfile}
              selectProfile={selectProfile}
              setConfig={setConfig}
            />
          ) : (
            <WorkbenchSidebar
              createError={createError}
              createMode={createMode}
              createPath={createPath}
              files={files}
              selectedFile={selectedFile}
              workspace={workspace}
              createEntry={() => void createEntry()}
              openEntry={(entry) => {
                if (entry.type === 'file') {
                  void openFile(entry.path)
                }
              }}
              refreshFiles={() => void refreshFiles()}
              selectWorkspace={() => void selectWorkspace()}
              setCreateMode={setCreateMode}
              setCreatePath={setCreatePath}
            />
          )
        ) : null}

        {primarySidebarVisible ? (
          <button
            aria-label="调整左侧面板宽度"
            className="resize-handle resize-handle-primary"
            type="button"
            onPointerDown={(event) => startColumnResize('primary', event)}
          />
        ) : null}

        <section className="workspace-main">
          {view === 'settings' ? (
            <SettingsView
              draft={draft}
              imageConfig={imageConfig}
              activeImageTemplateId={activeImageTemplateId}
              imageTemplates={imageTemplates}
              notice={notice}
              profiles={profiles}
              settingsPanel={settingsPanel}
              onDelete={() => void deleteProfile()}
              onSave={() => void saveProfile()}
              onSaveImageConfig={() => void saveImageConfig()}
              onSearchModels={(profileDraft) =>
                window.hcAgent.searchProviderModels(profileDraft)
              }
              onTestModel={(profileDraft) =>
                window.hcAgent.testProviderModel(profileDraft)
              }
              setDraft={setDraft}
              setImageConfig={setImageConfig}
              updateImageTemplateName={updateImageTemplateName}
            />
          ) : view === 'images' ? (
            <ImageWorkspace
              selectedImage={selectedImage}
              closeImage={() => setSelectedImage(null)}
            />
          ) : (
            <EditorWorkbench
              currentFileName={currentFileName}
              fileContent={fileContent}
              fileStatus={fileStatus}
              lineCount={lineCount}
              openTabs={openTabs}
              selectedFile={selectedFile}
              conversation={assistantConversation}
              closeTab={closeTab}
              openRecentWorkspace={(root) => void openRecentWorkspace(root)}
              openFile={(filePath) => void openFile(filePath)}
              recentWorkspaceRoots={recentWorkspaceRoots}
              saveFile={() => void saveFile()}
              setFileContent={setFileContent}
            />
          )}
        </section>

        {hasRightSidebar ? (
          <button
            aria-label="调整右侧面板宽度"
            className="resize-handle resize-handle-assistant"
            type="button"
            onPointerDown={(event) => startColumnResize('assistant', event)}
          />
        ) : null}

        {view === 'chat' || view === 'models' ? (
          selectedFile ? (
            <AssistantSidebar {...assistantConversation} />
          ) : (
            <GoalProgressSidebar
              actions={actions}
              goalProgress={goalProgress}
              messages={messages}
              setGoalProgress={setGoalProgress}
              workspace={workspace}
            />
          )
        ) : view === 'images' ? (
          <ImageHistorySidebar
            imageResults={imageResults}
            selectedImage={selectedImage}
            openImage={setSelectedImage}
          />
        ) : null}
      </div>

      <footer className="statusbar">
        <span>workspace</span>
        <span>{workspace?.root ?? '未打开工作区'}</span>
        <span>{selectedFile || '未选择文件'}</span>
        <span>{activeProfile?.apiKeySet ? 'API Key 已保存' : 'API Key 未保存'}</span>
        <span>{notice || fileStatus}</span>
      </footer>
    </main>
  )
}

function ActivityBar({
  primarySidebarVisible,
  view,
  setView,
}: {
  primarySidebarVisible: boolean
  view: ViewMode
  setView: (view: ViewMode) => void
}) {
  return (
    <nav className="activity-bar">
      <button
        className={
          primarySidebarVisible && view === 'chat'
            ? 'activity-button active'
            : 'activity-button'
        }
        type="button"
        title="工作台"
        onClick={() => setView('chat')}
      >
        <Code2 size={21} />
      </button>
      <button
        className={
          primarySidebarVisible && view === 'images'
            ? 'activity-button active'
            : 'activity-button'
        }
        type="button"
        title="图像生成"
        onClick={() => setView('images')}
      >
        <ImagePlus size={21} />
      </button>
      <button
        className={
          primarySidebarVisible && view === 'models'
            ? 'activity-button active'
            : 'activity-button'
        }
        type="button"
        title="模型配置"
        onClick={() => setView('models')}
      >
        <Cpu size={21} />
      </button>
      <div className="activity-spacer" />
      <button
        className={
          primarySidebarVisible && view === 'settings'
            ? 'activity-button active'
            : 'activity-button'
        }
        type="button"
        title="设置"
        onClick={() => setView('settings')}
      >
        <Settings size={21} />
      </button>
    </nav>
  )
}

function WorkbenchSidebar({
  createError,
  createMode,
  createPath,
  files,
  selectedFile,
  workspace,
  createEntry,
  openEntry,
  refreshFiles,
  selectWorkspace,
  setCreateMode,
  setCreatePath,
}: {
  createError: string
  createMode: CreateMode | null
  createPath: string
  files: FileEntry[]
  selectedFile: string
  workspace: WorkspaceInfo | null
  createEntry: () => void
  openEntry: (entry: FileEntry) => void
  refreshFiles: () => void
  selectWorkspace: () => void
  setCreateMode: (mode: CreateMode | null) => void
  setCreatePath: (path: string) => void
}) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    () => new Set(),
  )

  function toggleDirectory(path: string) {
    setExpandedDirectories((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <aside className="primary-sidebar file-explorer-sidebar">
      <section className="sidebar-section workspace-section">
        <div className="section-header">
          <span>资源管理器</span>
          <button
            className="icon-button"
            type="button"
            title="刷新"
            disabled={!workspace}
            onClick={refreshFiles}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <button className="project-button" type="button" onClick={selectWorkspace}>
          <FolderOpen size={16} />
          <span>打开/添加工作区</span>
        </button>
        <div className="workspace-path">{workspace?.root ?? '未打开工作区'}</div>
      </section>

      <section className="sidebar-section file-actions-section">
        <div className="file-create-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={!workspace}
            onClick={() => setCreateMode('file')}
          >
            <Plus size={14} />
            文件
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!workspace}
            onClick={() => setCreateMode('directory')}
          >
            <Plus size={14} />
            文件夹
          </button>
        </div>
        {createMode ? (
          <div className="create-entry-form">
            <label>
              {createMode === 'file' ? '文件路径' : '文件夹路径'}
              <input
                value={createPath}
                placeholder={
                  createMode === 'file' ? 'src/new-file.ts' : 'src/new-folder'
                }
                onChange={(event) => setCreatePath(event.target.value)}
              />
            </label>
            {createError ? (
              <div className="create-entry-error">{createError}</div>
            ) : null}
            <div className="create-entry-actions">
              <button className="primary-button" type="button" onClick={createEntry}>
                创建
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setCreateMode(null)}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sidebar-section file-section">
        <div className="file-tree">
          {tree.length === 0 ? (
            <div className="empty-inline">没有文件</div>
          ) : (
            tree.map((node) => (
              <FileTreeItem
                expandedDirectories={expandedDirectories}
                key={node.path}
                node={node}
                selectedFile={selectedFile}
                depth={0}
                onOpenFile={(path) =>
                  openEntry({ path, name: path.split('/').at(-1) ?? path, type: 'file' })
                }
                onToggleDirectory={toggleDirectory}
              />
            ))
          )}
        </div>
      </section>
    </aside>
  )
}

function FileTreeItem({
  depth,
  expandedDirectories,
  node,
  selectedFile,
  onOpenFile,
  onToggleDirectory,
}: {
  depth: number
  expandedDirectories: Set<string>
  node: FileTreeNode
  selectedFile: string
  onOpenFile: (path: string) => void
  onToggleDirectory: (path: string) => void
}) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedDirectories.has(node.path)
  const isSelected = node.path === selectedFile
  const containsSelected =
    isDirectory &&
    Boolean(selectedFile) &&
    selectedFile.startsWith(`${node.path}/`)

  return (
    <div className="file-tree-item">
      <button
        className={[
          'file',
          isDirectory ? 'directory-node' : '',
          isSelected ? 'active' : '',
          containsSelected ? 'active-parent' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: 8 + depth * 14 }}
        type="button"
        title={node.path}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(node.path)
            return
          }
          onOpenFile(node.path)
        }}
      >
        <span className="tree-chevron">
          {isDirectory ? (
            isExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )
          ) : null}
        </span>
        <span className="file-icon">
          {isDirectory ? <FolderOpen size={14} /> : <FileCode2 size={14} />}
        </span>
        <span>{node.name}</span>
      </button>
      {isDirectory && isExpanded && node.children.length > 0 ? (
        <div className="file-tree-level">
          {node.children.map((child) => (
            <FileTreeItem
              depth={depth + 1}
              expandedDirectories={expandedDirectories}
              key={child.path}
              node={child}
              selectedFile={selectedFile}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ModelSelectSidebar({
  activeProfile,
  config,
  profiles,
  createProfile,
  editProfile,
  selectProfile,
  setConfig,
}: ModelSelectProps) {
  return (
    <aside className="primary-sidebar model-switch-sidebar">
      <section className="sidebar-section workspace-section">
        <div className="section-header">
          <span>模型配置</span>
          <button
            className="icon-button"
            type="button"
            title="新增配置"
            onClick={createProfile}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="model-current-card">
          <span>当前模型</span>
          <strong>{config.model || activeProfile?.defaultModel || '未选择'}</strong>
          <small>{activeProfile?.name ?? '未选择中转'}</small>
        </div>
      </section>
      <section className="sidebar-section model-list-section">
        {profiles.length === 0 ? (
          <div className="sidebar-empty-state compact">
            <strong>暂无模型配置</strong>
            <span>到设置页新增中转、Key 和模型。</span>
          </div>
        ) : (
          profiles.map((profile) => (
            <div className="model-profile-group" key={profile.id}>
              <div className="model-profile-header">
                <strong>{profile.name}</strong>
                <button
                  className="icon-button"
                  type="button"
                  title="编辑配置"
                  onClick={() => editProfile(profile)}
                >
                  <Settings size={14} />
                </button>
              </div>
              <div className="model-option-list">
                {(profile.models.length ? profile.models : [profile.defaultModel]).map(
                  (model) => (
                    <button
                      className={
                        profile.id === config.profileId && model === config.model
                          ? 'model-option active'
                          : 'model-option'
                      }
                      key={`${profile.id}-${model}`}
                      type="button"
                      onClick={() => {
                        selectProfile(profile.id)
                        setConfig((current) => ({
                          ...current,
                          profileId: profile.id,
                          model,
                          reasoningEffort: profile.reasoningEffort,
                          disableResponseStorage: profile.disableResponseStorage,
                        }))
                      }}
                    >
                      <span>{model}</span>
                      {profile.apiKeySet ? <CheckCircle2 size={14} /> : null}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </aside>
  )
}

function SettingsSidebar({
  draft,
  activeImageTemplateId,
  imageConfig,
  imageTemplates,
  profiles,
  settingsPanel,
  onCreate,
  onCreateImageTemplate,
  onEdit,
  onSelectImageTemplate,
  setSettingsPanel,
}: {
  draft: ProviderProfileInput
  activeImageTemplateId: string
  imageConfig: ImageGenerationConfigInput
  imageTemplates: ImageTemplate[]
  profiles: ProviderProfile[]
  settingsPanel: SettingsPanel
  onCreate: () => void
  onCreateImageTemplate: () => void
  onEdit: (profile: ProviderProfile) => void
  onSelectImageTemplate: (template: ImageTemplate) => void
  setSettingsPanel: (panel: SettingsPanel) => void
}) {
  const promptProfile = profiles.find(
    (profile) => profile.id === imageConfig.promptProfileId,
  )

  return (
    <aside className="primary-sidebar settings-sidebar">
      <section className="sidebar-section">
        <div className="section-header">
          <span>配置</span>
          <button
            className="icon-button"
            type="button"
            title={settingsPanel === 'base' ? '新增普通模板' : '新增图片模板'}
            onClick={() => {
              if (settingsPanel === 'base') {
                setSettingsPanel('base')
                onCreate()
              } else {
                onCreateImageTemplate()
              }
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="settings-panel-list">
          <button
            className={
              settingsPanel === 'base'
                ? 'settings-panel-item active'
                : 'settings-panel-item'
            }
            type="button"
            onClick={() => setSettingsPanel('base')}
          >
            <Code2 size={16} />
            <span>
              <strong>普通模型配置</strong>
              <small>
                {draft.name || '未选择'} · {draft.defaultModel || '未配置'}
              </small>
            </span>
          </button>
          <button
            className={
              settingsPanel === 'image'
                ? 'settings-panel-item active'
                : 'settings-panel-item'
            }
            type="button"
            onClick={() => setSettingsPanel('image')}
          >
            <ImagePlus size={16} />
            <span>
              <strong>图片生成模型配置</strong>
              <small>
                {promptProfile?.name ?? '内置提示词'} ·{' '}
                {imageConfig.model || '未配置'}
              </small>
            </span>
          </button>
        </div>
      </section>
      {settingsPanel === 'base' ? (
        <section className="sidebar-section file-section">
          <div className="section-header">
            <span>普通模板</span>
            <small>{profiles.length} 个</small>
          </div>
          <div className="profile-list">
            {profiles.map((profile) => (
              <button
                className={
                  profile.id === draft.id ? 'profile-item active' : 'profile-item'
                }
                key={profile.id}
                type="button"
                onClick={() => onEdit(profile)}
              >
                <strong>{profile.name}</strong>
                <span>{profile.baseUrl}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="sidebar-section file-section image-config-nav">
          <div className="section-header">
            <span>图片模板</span>
            <small>{imageTemplates.length} 个</small>
          </div>
          <div className="profile-list">
            {imageTemplates.length === 0 ? (
              <div className="sidebar-empty-state compact">
                <strong>暂无图片模板</strong>
                <span>点击右上角加号创建当前图片模型组合。</span>
              </div>
            ) : (
              imageTemplates.map((template) => (
                <button
                  className={
                    template.id === activeImageTemplateId
                      ? 'profile-item active'
                      : 'profile-item'
                  }
                  key={template.id}
                  type="button"
                  onClick={() => onSelectImageTemplate(template)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.config.model || '未配置'}</span>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </aside>
  )
}
function EditorWorkbench({
  currentFileName,
  fileContent,
  fileStatus,
  lineCount,
  openTabs,
  selectedFile,
  conversation,
  closeTab,
  openRecentWorkspace,
  openFile,
  recentWorkspaceRoots,
  saveFile,
  setFileContent,
}: {
  currentFileName: string
  fileContent: string
  fileStatus: string
  lineCount: number
  openTabs: string[]
  selectedFile: string
  conversation: AssistantConversationProps
  closeTab: (filePath: string) => void
  openRecentWorkspace: (root: string) => void
  openFile: (filePath: string) => void
  recentWorkspaceRoots: string[]
  saveFile: () => void
  setFileContent: (content: string) => void
}) {
  return (
    <section
      className={
        selectedFile ? 'editor-workbench' : 'editor-workbench empty-workbench'
      }
    >
      <div className="editor-tabs">
        <div className="editor-tab-strip">
          {!selectedFile ? (
            <button className="editor-tab editor-tab-home active" type="button">
              <FileCode2 size={15} />
              <span className="editor-tab-label">AI 对话</span>
            </button>
          ) : (
            openTabs.map((tab) => (
              <button
                className={tab === selectedFile ? 'editor-tab active' : 'editor-tab'}
                key={tab}
                type="button"
              >
                <span
                  className="editor-tab-main"
                  role="button"
                  tabIndex={0}
                  onClick={() => openFile(tab)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      openFile(tab)
                    }
                  }}
                >
                  <FileCode2 size={15} />
                  <span className="editor-tab-label">{tab}</span>
                </span>
                <span
                  className="editor-tab-close"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation()
                      closeTab(tab)
                    }
                  }}
                >
                  <X size={13} />
                </span>
              </button>
            ))
          )}
        </div>
        <button
          className="editor-action"
          type="button"
          title="淇濆瓨"
          disabled={!selectedFile}
          onClick={saveFile}
        >
          <Save size={15} />
        </button>
      </div>
      {selectedFile ? (
        <>
          <div className="breadcrumbs">
            <span>{currentFileName}</span>
            <span>{fileStatus}</span>
          </div>
          <div className="editor-surface">
            <pre className="line-numbers" aria-hidden="true">
              {Array.from({ length: lineCount }, (_item, index) => index + 1).join(
                '\n',
              )}
            </pre>
            <textarea
              className="file-editor"
              value={fileContent}
              spellCheck={false}
              onChange={(event) => setFileContent(event.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="editor-empty start-workspace">
          {conversation.workspace ? (
            <AssistantConversation
              {...conversation}
              className="workspace-conversation"
            />
          ) : (
            <RecentWorkspacesPanel
              recentWorkspaceRoots={recentWorkspaceRoots}
              onOpenRecent={openRecentWorkspace}
            />
          )}
        </div>
      )}
    </section>
  )
}

function RecentWorkspacesPanel({
  recentWorkspaceRoots,
  onOpenRecent,
}: {
  recentWorkspaceRoots: string[]
  onOpenRecent: (root: string) => void
}) {
  return (
    <div className="recent-workspaces-panel">
      <header className="recent-workspaces-header">
        <div>
          <FolderOpen size={18} />
          <strong>最近打开的工作区</strong>
        </div>
      </header>
      <div className="recent-workspace-list">
        {recentWorkspaceRoots.length === 0 ? (
          <div className="recent-workspace-empty">暂无最近工作区</div>
        ) : (
          recentWorkspaceRoots.map((root) => (
            <button
              className="recent-workspace-item"
              key={root}
              type="button"
              title={root}
              onClick={() => onOpenRecent(root)}
            >
              <FolderOpen size={17} />
              <span>
                <strong>{readWorkspaceName(root)}</strong>
                <small>{root}</small>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function AssistantConversation({
  actions,
  activeProfile,
  className = '',
  config,
  input,
  isSending,
  messages,
  notice,
  sendMessage,
  setInput,
  workspace,
}: AssistantConversationProps & { className?: string }) {
  const actionMessageId = messages.findLast(
    (message) => message.role === 'assistant',
  )?.id

  return (
    <div className={['assistant-conversation', className].filter(Boolean).join(' ')}>
      <header className="assistant-header">
        <div>
          <Bot size={17} />
          <strong>AI Agent</strong>
        </div>
        <span>{config.model || activeProfile?.defaultModel || '-'}</span>
      </header>
      <div className="assistant-subheader">
        <span>{activeProfile?.name ?? '未配置'}</span>
        <span>{notice || workspace?.root || '未打开工作区'}</span>
      </div>
      <div className="messages">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <div className="agent-empty-header">
              <div>
                <Bot size={20} />
                <span>开始会话</span>
              </div>
              <strong>{activeProfile?.name ?? '未配置模型'}</strong>
            </div>
            <div className="agent-context-card">
              <span>CONTEXT</span>
              <strong>{workspace?.root ?? '未打开工作区'}</strong>
              <p>发送任务后，AI 可以读取、修改文件并运行允许的命令。</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article className={'message ' + message.role} key={message.id}>
              <div className="message-role">
                {message.role === 'user' ? '你' : 'AI'}
              </div>
              <pre>{message.content}</pre>
              {message.id === actionMessageId && actions.length > 0 ? (
                <ActionDetails actions={actions} />
              ) : null}
            </article>
          ))
        )}
      </div>
      <footer className="composer">
        <textarea
          value={input}
          placeholder="描述开发任务、界面修改或代码问题..."
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) {
              return
            }
            if (event.nativeEvent.isComposing) {
              return
            }
            event.preventDefault()
            if (!isSending && input.trim()) {
              sendMessage()
            }
          }}
        />
        <button
          className="send-button"
          type="button"
          disabled={isSending || !input.trim()}
          onClick={sendMessage}
        >
          <Send size={16} />
          <span>{isSending ? '处理中' : '发送'}</span>
        </button>
      </footer>
    </div>
  )
}

function ActionDetails({ actions }: { actions: AgentActionResult[] }) {
  return (
    <details className="action-details" open>
      <summary>
        <span>执行记录</span>
        <strong>{actions.length}</strong>
      </summary>
      <div className="action-strip">
        {actions.map((action, index) => (
          <div className="action-card" key={`${action.type}-${index}`}>
            <div className={action.ok ? 'action ok' : 'action fail'}>
              {action.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              <span>{action.summary}</span>
            </div>
            {action.diff ? <DiffViewer diff={action.diff} /> : null}
          </div>
        ))}
      </div>
    </details>
  )
}

function AssistantSidebar(props: AssistantConversationProps) {
  return (
    <aside className="assistant-sidebar">
      <AssistantConversation {...props} />
    </aside>
  )
}

function GoalProgressSidebar({
  actions,
  goalProgress,
  messages,
  setGoalProgress,
  workspace,
}: {
  actions: AgentActionResult[]
  goalProgress: GoalProgressState
  messages: ChatMessage[]
  setGoalProgress: React.Dispatch<React.SetStateAction<GoalProgressState>>
  workspace: WorkspaceInfo | null
}) {
  const goalItems = goalProgress.items
  const filledItems = goalItems.filter((item) => item.title.trim())
  const completedCount = filledItems.filter((item) => item.done).length
  const progress = filledItems.length
    ? Math.round((completedCount / filledItems.length) * 100)
    : 0
  const recentActions = actions.slice(-3).toReversed()
  const latestAssistantMessage = messages.findLast(
    (message) => message.role === 'assistant',
  )
  const nextItem = filledItems.find((item) => !item.done)

  function updateGoal(projectGoal: string) {
    setGoalProgress((current) => ({ ...current, projectGoal }))
  }

  function updateItem(id: string, patch: Partial<GoalProgressItem>) {
    setGoalProgress((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }))
  }

  function addItem() {
    setGoalProgress((current) => ({
      ...current,
      items: [
        ...current.items,
        { id: crypto.randomUUID(), title: '', done: false },
      ],
    }))
  }

  function removeItem(id: string) {
    setGoalProgress((current) => ({
      ...current,
      items:
        current.items.length > 1
          ? current.items.filter((item) => item.id !== id)
          : [{ id: crypto.randomUUID(), title: '', done: false }],
    }))
  }

  return (
    <aside className="assistant-sidebar goal-progress-sidebar">
      <header className="goal-board-header">
        <div>
          <CheckCircle2 size={18} />
          <strong>目标进度</strong>
        </div>
        <span>{progress}%</span>
      </header>

      <div className="goal-board-content">
        <section className="goal-board-section">
          <div className="goal-section-title">
            <span>项目目标</span>
            <small>{completedCount}/{filledItems.length || 0}</small>
          </div>
          <label className="goal-field-label">
            目标
            <textarea
              className="goal-title-input"
              value={goalProgress.projectGoal}
              placeholder="例如：完成无人机飞行"
              onChange={(event) => updateGoal(event.target.value)}
            />
          </label>
          <div className="goal-step-list">
            {goalItems.map((item, index) => (
              <div className="goal-step-row" key={item.id}>
                <label className="goal-check">
                  <input
                    checked={item.done}
                    type="checkbox"
                    onChange={(event) =>
                      updateItem(item.id, { done: event.target.checked })
                    }
                  />
                </label>
                <input
                  value={item.title}
                  placeholder={
                    index === 0
                      ? '例如：跑通协议层'
                      : index === 1
                        ? '例如：完成 FOC 调试代码'
                        : '填写下一步目标'
                  }
                  onChange={(event) =>
                    updateItem(item.id, { title: event.target.value })
                  }
                />
                <button
                  className="icon-button"
                  type="button"
                  title="删除步骤"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={addItem}>
            <Plus size={14} />
            添加步骤
          </button>
        </section>

        <section className="goal-board-section">
          <div className="goal-section-title">
            <span>AI 推进建议</span>
            <small>{workspace ? '已关联工作区' : '未关联工作区'}</small>
          </div>
          <div className="goal-insight-card">
            <strong>下一步</strong>
            <p>
              {nextItem
                ? `围绕「${nextItem.title}」继续让 AI 修改、验证或补齐代码。`
                : filledItems.length
                  ? '当前清单已全部勾选，可以补充验收项或拆出下一阶段。'
                  : '先写下项目目标和关键步骤，右侧会持续记录推进状态。'}
            </p>
          </div>
          <div className="goal-insight-card">
            <strong>最近执行</strong>
            {recentActions.length > 0 ? (
              <ul className="goal-action-list">
                {recentActions.map((action, index) => (
                  <li key={`${action.type}-${index}`}>
                    <span className={action.ok ? 'goal-dot ok' : 'goal-dot fail'} />
                    <span>{action.summary}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无执行记录。让 AI 读文件、改代码或运行检查后会出现在这里。</p>
            )}
          </div>
          {latestAssistantMessage ? (
            <div className="goal-insight-card">
              <strong>最近回复</strong>
              <p>{truncateText(latestAssistantMessage.content, 120)}</p>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  )
}
function ImageSidebar({
  imageConfig,
  buildImagePrompt,
  generateImage,
  isGenerating,
  isPrompting,
  prompt,
  setIsGenerating,
  setIsPrompting,
  setPrompt,
  setSource,
  setStatus,
  source,
  status,
}: {
  imageConfig: ImageGenerationConfigInput
  buildImagePrompt: (source: string) => Promise<string>
  generateImage: (prompt: string, source: string) => Promise<GeneratedImageRecord>
  isGenerating: boolean
  isPrompting: boolean
  prompt: string
  setIsGenerating: (value: boolean) => void
  setIsPrompting: (value: boolean) => void
  setPrompt: (value: string) => void
  setSource: (value: string) => void
  setStatus: (value: string) => void
  source: string
  status: string
}) {
  async function createPrompt() {
    if (!source.trim()) {
      setStatus('先输入要生成的画面。')
      return
    }
    setIsPrompting(true)
    setStatus('正在生成提示词...')
    try {
      const nextPrompt = await buildImagePrompt(source)
      setPrompt(nextPrompt)
      setStatus('提示词已生成。')
    } catch (error) {
      setStatus(readError(error))
    } finally {
      setIsPrompting(false)
    }
  }

  async function runImageGeneration() {
    if (!prompt.trim()) {
      setStatus('请先确认提示词。')
      return
    }
    setIsGenerating(true)
    setStatus('正在生成图像...')
    try {
      const result = await generateImage(prompt, source)
      setStatus(result.message)
    } catch (error) {
      setStatus(readError(error))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <aside className="primary-sidebar image-generation-sidebar">
      <section className="sidebar-section workspace-section">
        <div className="section-header">
          <span>图像生成</span>
          <ImagePlus size={16} />
        </div>
        <div className="image-config-summary">
          <span>当前图片模型</span>
          <strong>{imageConfig.model || '未配置'}</strong>
          <small>{imageConfig.size} / {imageConfig.quality}</small>
        </div>
      </section>

      <section className="sidebar-section image-workflow-section">
        <label>
          需求
          <textarea
            className="image-source-editor"
            value={source}
            placeholder="例如：给我生成热带雨林的提示词"
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={isPrompting || !source.trim()}
          onClick={() => void createPrompt()}
        >
          <WandSparkles size={15} />
          {isPrompting ? '生成中' : '生成提示词'}
        </button>
        <label>
          确认后的提示词
          <textarea
            className="image-prompt-editor"
            value={prompt}
            placeholder="提示词会出现在这里，可人工确认和修改。"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={isGenerating || !prompt.trim()}
          onClick={() => void runImageGeneration()}
        >
          <Sparkles size={15} />
          {isGenerating ? '生成中' : '生图'}
        </button>
        <div className="image-generation-status">{status}</div>
      </section>
    </aside>
  )
}

function ImageWorkspace({
  selectedImage,
}: {
  selectedImage: GeneratedImageRecord | null
  closeImage: () => void
}) {
  const [zoom, setZoom] = useState(100)
  const [isImagePanning, setIsImagePanning] = useState(false)
  const imagePreviewRef = useRef<HTMLDivElement | null>(null)
  const imagePanRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(300, Math.max(25, nextZoom)))
  }

  function zoomImageAtPointer(event: WheelEvent<HTMLDivElement>) {
    if (!selectedImage?.imageUrl) {
      return
    }

    event.preventDefault()
    const preview = imagePreviewRef.current
    if (!preview) {
      return
    }

    const rect = preview.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const relativeX = (preview.scrollLeft + offsetX) / preview.scrollWidth
    const relativeY = (preview.scrollTop + offsetY) / preview.scrollHeight
    const direction = event.deltaY < 0 ? 1 : -1

    setZoom((currentZoom) =>
      Math.min(300, Math.max(25, currentZoom + direction * 10)),
    )

    window.requestAnimationFrame(() => {
      preview.scrollLeft = preview.scrollWidth * relativeX - offsetX
      preview.scrollTop = preview.scrollHeight * relativeY - offsetY
    })
  }

  function startImagePan(event: PointerEvent<HTMLDivElement>) {
    if (!selectedImage?.imageUrl || !event.ctrlKey || event.button !== 0) {
      return
    }

    const preview = imagePreviewRef.current
    if (!preview) {
      return
    }

    event.preventDefault()
    imagePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: preview.scrollLeft,
      scrollTop: preview.scrollTop,
    }
    setIsImagePanning(true)
    preview.setPointerCapture(event.pointerId)
  }

  function moveImagePan(event: PointerEvent<HTMLDivElement>) {
    const pan = imagePanRef.current
    const preview = imagePreviewRef.current
    if (!pan || !preview || pan.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    preview.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX)
    preview.scrollTop = pan.scrollTop - (event.clientY - pan.startY)
  }

  function stopImagePan(event: PointerEvent<HTMLDivElement>) {
    const pan = imagePanRef.current
    const preview = imagePreviewRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }

    imagePanRef.current = null
    setIsImagePanning(false)
    if (preview?.hasPointerCapture(event.pointerId)) {
      preview.releasePointerCapture(event.pointerId)
    }
  }

  if (selectedImage) {
    return (
      <section className="image-workbench">
        <div className="image-result-window">
          <header>
            <div>
              <strong>{selectedImage.title}</strong>
              <span>{selectedImage.message}</span>
            </div>
            {selectedImage.imageUrl ? (
              <div className="image-zoom-controls" aria-label="图片缩放">
                <button
                  className="icon-button"
                  type="button"
                  title="缩小"
                  disabled={zoom <= 25}
                  onClick={() => updateZoom(zoom - 25)}
                >
                  <ZoomOut size={15} />
                </button>
                <input
                  aria-label="缩放比例"
                  max="300"
                  min="25"
                  step="25"
                  type="range"
                  value={zoom}
                  onChange={(event) => updateZoom(Number(event.target.value))}
                />
                <span>{zoom}%</span>
                <button
                  className="icon-button"
                  type="button"
                  title="放大"
                  disabled={zoom >= 300}
                  onClick={() => updateZoom(zoom + 25)}
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="重置缩放"
                  onClick={() => updateZoom(100)}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            ) : null}
          </header>
          {selectedImage.imageUrl ? (
            <div
              className={
                isImagePanning
                  ? 'image-preview-scroll panning'
                  : 'image-preview-scroll'
              }
              ref={imagePreviewRef}
              onPointerCancel={stopImagePan}
              onPointerDown={startImagePan}
              onPointerMove={moveImagePan}
              onPointerUp={stopImagePan}
              onWheel={zoomImageAtPointer}
            >
              <div
                className={
                  zoom > 100
                    ? 'image-preview-stage zoomed-in'
                    : 'image-preview-stage'
                }
              >
                <img
                  alt={selectedImage.title}
                  src={selectedImage.imageUrl}
                  style={{ width: `${zoom}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="image-result-empty">{selectedImage.message}</p>
          )}
          <p className="image-result-prompt">
            {selectedImage.revisedPrompt || selectedImage.prompt}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="image-gallery-home">
      <header className="conversation-home-header">
        <div>
          <ImagePlus size={18} />
          <strong>图像预览</strong>
        </div>
        <span>未选择</span>
      </header>
      <div className="image-gallery-grid">
        <div className="image-empty-state">
          <span className="image-empty-icon">
            <ImagePlus size={24} />
          </span>
          <strong>暂无选中图像</strong>
          <p>从右侧历史图像选择，或在左侧输入需求生成新图。</p>
        </div>
      </div>
    </section>
  )
}

function ImageHistorySidebar({
  imageResults,
  selectedImage,
  openImage,
}: {
  imageResults: GeneratedImageRecord[]
  selectedImage: GeneratedImageRecord | null
  openImage: (result: GeneratedImageRecord) => void
}) {
  return (
    <aside className="assistant-sidebar image-history-sidebar">
      <header className="assistant-header">
        <div>
          <ImagePlus size={17} />
          <strong>所有图像</strong>
        </div>
        <span>{imageResults.length} 张</span>
      </header>
      <div className="image-history-list">
        {imageResults.length === 0 ? (
          <div className="sidebar-empty-state compact">
            <strong>暂无图像</strong>
            <span>生成后的图片会出现在这里。</span>
          </div>
        ) : (
          imageResults.map((item) => (
            <button
              className={
                selectedImage?.id === item.id
                  ? 'image-gallery-item active'
                  : 'image-gallery-item'
              }
              key={item.id}
              type="button"
              onClick={() => openImage(item)}
            >
              {item.imageUrl ? (
                <img alt={item.title} src={item.imageUrl} />
              ) : (
                <span className="image-gallery-placeholder">无预览</span>
              )}
              <span>{item.title}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
function SettingsView({
  draft,
  activeImageTemplateId,
  imageConfig,
  imageTemplates,
  notice,
  profiles,
  settingsPanel,
  onDelete,
  onSave,
  onSaveImageConfig,
  onSearchModels,
  onTestModel,
  setDraft,
  setImageConfig,
  updateImageTemplateName,
}: {
  draft: ProviderProfileInput
  activeImageTemplateId: string
  imageConfig: ImageGenerationConfigInput
  imageTemplates: ImageTemplate[]
  notice: string
  profiles: ProviderProfile[]
  settingsPanel: SettingsPanel
  onDelete: () => void
  onSave: () => void
  onSaveImageConfig: () => void
  onSearchModels: (draft: ProviderProfileInput) => Promise<ProviderModelInfo[]>
  onTestModel: (draft: ProviderProfileInput) => Promise<ProviderModelTestResult>
  setDraft: (draft: ProviderProfileInput) => void
  setImageConfig: (config: ImageGenerationConfigInput) => void
  updateImageTemplateName: (name: string) => void
}) {
  const [modelQuery, setModelQuery] = useState('')
  const [modelResults, setModelResults] = useState<ProviderModelInfo[]>([])
  const [modelStatus, setModelStatus] = useState('')
  const [testStatus, setTestStatus] = useState('')
  const promptProfile = profiles.find(
    (profile) => profile.id === imageConfig.promptProfileId,
  )
  const promptModels = promptProfile?.models.length
    ? promptProfile.models
    : promptProfile
      ? [promptProfile.defaultModel]
      : []
  const activeImageTemplate = imageTemplates.find(
    (template) => template.id === activeImageTemplateId,
  )
  const filteredModels = modelResults.filter((model) =>
    model.id.toLowerCase().includes(modelQuery.trim().toLowerCase()),
  )

  async function searchModels() {
    setModelStatus('正在搜索模型...')
    try {
      const results = await onSearchModels(draft)
      setModelResults(results)
      setModelStatus(`找到 ${results.length} 个模型`)
    } catch (error) {
      setModelStatus(readError(error))
    }
  }

  async function testModel() {
    setTestStatus('正在测试模型...')
    try {
      const result = await onTestModel(draft)
      setTestStatus(
        result.ok
          ? `${result.message}，延迟 ${result.latencyMs}ms`
          : `测试失败：${result.message}`,
      )
    } catch (error) {
      setTestStatus(readError(error))
    }
  }

  function selectModel(modelId: string) {
    setDraft({
      ...draft,
      defaultModel: modelId,
      models: Array.from(new Set([modelId, ...draft.models])),
    })
  }

  return (
    <section className="settings-view">
      <header className="settings-header">
        <div>
          <h1>
            {settingsPanel === 'base' ? '普通模型配置' : '图片生成模型配置'}
          </h1>
          <p>
            {settingsPanel === 'base'
              ? '配置中转、模型、认证和默认推理参数。'
              : '配置提示词生成模型，以及实际调用的图片生成模型。'}
          </p>
        </div>
      </header>
      {settingsPanel === 'base' ? (
        <section className="settings-form">
        <label>
          名称
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          类型
          <select
            value={draft.provider}
            onChange={(event) =>
              setDraft({ ...draft, provider: event.target.value as ProviderId })
            }
          >
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base URL
          <input
            value={draft.baseUrl}
            onChange={(event) =>
              setDraft({ ...draft, baseUrl: event.target.value })
            }
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={draft.apiKey ?? ''}
            placeholder={draft.id ? '留空保留原 Key' : '输入 API Key'}
            onChange={(event) =>
              setDraft({ ...draft, apiKey: event.target.value })
            }
          />
        </label>
        <section className="model-search-panel">
          <label>
            搜索模型
            <div className="model-search-row">
              <input
                value={modelQuery}
                placeholder="输入关键词过滤，例如 deepseek、gpt、claude"
                onChange={(event) => setModelQuery(event.target.value)}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => void searchModels()}
              >
                <Search size={15} />
                搜索
              </button>
            </div>
          </label>
          <div className="model-search-status">{modelStatus}</div>
          <div className="model-search-results">
            {filteredModels.slice(0, 80).map((model) => (
              <button
                className={
                  model.id === draft.defaultModel
                    ? 'model-search-result active'
                    : 'model-search-result'
                }
                key={model.id}
                type="button"
                onClick={() => selectModel(model.id)}
              >
                <span>{model.id}</span>
                {model.ownedBy ? <small>{model.ownedBy}</small> : null}
              </button>
            ))}
          </div>
        </section>
        <section className="model-test-panel">
          <div>
            <strong>测试模型</strong>
            <span>用当前默认模型发送一次最小请求，检查 Key、网络、模型名和协议。</span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void testModel()}
          >
            <CheckCircle2 size={15} />
            测试
          </button>
          <p>{testStatus}</p>
        </section>
        <label>
          默认模型
          <input
            value={draft.defaultModel}
            onChange={(event) =>
              setDraft({ ...draft, defaultModel: event.target.value })
            }
          />
        </label>
        <label>
          可选模型
          <textarea
            className="model-list-input"
            value={draft.models.join('\n')}
            onChange={(event) =>
              setDraft({
                ...draft,
                models: event.target.value
                  .split('\n')
                  .map((model) => model.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          协议
          <select
            value={draft.protocol}
            onChange={(event) =>
              setDraft({
                ...draft,
                protocol: event.target.value as ProviderProtocol,
              })
            }
          >
            {Object.entries(protocolLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reasoning Effort
          <select
            value={draft.reasoningEffort}
            onChange={(event) =>
              setDraft({
                ...draft,
                reasoningEffort: event.target.value as ReasoningEffort,
              })
            }
          >
            {Object.entries(reasoningLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.disableResponseStorage}
            onChange={(event) =>
              setDraft({ ...draft, disableResponseStorage: event.target.checked })
            }
          />
          disable_response_storage = true
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.requiresOpenAiAuth}
            onChange={(event) =>
              setDraft({ ...draft, requiresOpenAiAuth: event.target.checked })
            }
          />
          requires_openai_auth = true
        </label>

        <div className="settings-actions">
          <button className="primary-button" type="button" onClick={onSave}>
            <Save size={16} />
            保存
          </button>
          <button className="danger-button" type="button" onClick={onDelete}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
        <div className="muted">{notice}</div>
      </section>
      ) : (
      <section className="settings-form image-settings-form">
        <section className="image-settings-panel">
          <header>
            <div>
              <strong>图片生成模型配置</strong>
              <span>右侧单独管理提示词生成模型和图片生成模型。</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={onSaveImageConfig}
            >
              <Save size={15} />
              保存图像配置
            </button>
          </header>
          <div className="image-settings-grid">
            <label>
              模板名称
              <input
                value={activeImageTemplate?.name ?? '当前图像配置'}
                disabled={!activeImageTemplate}
                onChange={(event) => updateImageTemplateName(event.target.value)}
              />
            </label>
            <label>
              提示词生成配置
              <select
                value={imageConfig.promptProfileId}
                onChange={(event) => {
                  const nextProfile = profiles.find(
                    (profile) => profile.id === event.target.value,
                  )
                  setImageConfig({
                    ...imageConfig,
                    promptProfileId: event.target.value,
                    promptModel: nextProfile?.defaultModel ?? '',
                  })
                }}
              >
                <option value="">使用内置规则</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              提示词生成模型
              <select
                value={imageConfig.promptModel}
                disabled={!imageConfig.promptProfileId}
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, promptModel: event.target.value })
                }
              >
                <option value="">未选择</option>
                {promptModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              图片 Base URL
              <input
                value={imageConfig.baseUrl}
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, baseUrl: event.target.value })
                }
              />
            </label>
            <label>
              图片 API Key
              <input
                type="password"
                value={imageConfig.apiKey ?? ''}
                placeholder="留空保留原图片 Key"
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, apiKey: event.target.value })
                }
              />
            </label>
            <label>
              图片生成模型
              <input
                value={imageConfig.model}
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, model: event.target.value })
                }
              />
            </label>
            <label>
              尺寸
              <select
                value={imageConfig.size}
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, size: event.target.value })
                }
              >
                <option value="1024x1024">1024x1024</option>
                <option value="1024x1536">1024x1536</option>
                <option value="1536x1024">1536x1024</option>
                <option value="auto">auto</option>
              </select>
            </label>
            <label>
              质量
              <select
                value={imageConfig.quality}
                onChange={(event) =>
                  setImageConfig({ ...imageConfig, quality: event.target.value })
                }
              >
                <option value="auto">auto</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={imageConfig.requiresOpenAiAuth}
                onChange={(event) =>
                  setImageConfig({
                    ...imageConfig,
                    requiresOpenAiAuth: event.target.checked,
                  })
                }
              />
              图片接口需要 OpenAI Authorization
            </label>
          </div>
        </section>

        <div className="muted">{notice}</div>
      </section>
      )}
    </section>
  )
}
function DiffViewer({ diff }: { diff: string }) {
  return (
    <pre className="diff-viewer">
      {diff.split('\n').map((line, index) => {
        const className = line.startsWith('+')
          ? 'diff-line diff-added'
          : line.startsWith('-')
            ? 'diff-line diff-removed'
            : line.startsWith('@@')
              ? 'diff-line diff-hunk'
              : line.startsWith('diff')
                ? 'diff-line diff-meta'
                : 'diff-line diff-context'
        return (
          <span className={className} key={`${index}-${line}`}>
            <span className="diff-prefix">{line.slice(0, 1)}</span>
            <code>{line}</code>
          </span>
        )
      })}
    </pre>
  )
}

function buildFileTree(entries: FileEntry[]): FileTreeNode[] {
  const nodeMap = new Map<string, FileTreeNode>()
  const rootNodes: FileTreeNode[] = []

  function ensureDirectory(pathValue: string) {
    const normalized = pathValue.replaceAll('\\', '/')
    const existing = nodeMap.get(normalized)
    if (existing) {
      existing.type = 'directory'
      return existing
    }

    const node: FileTreeNode = {
      name: normalized.split('/').at(-1) ?? normalized,
      path: normalized,
      type: 'directory',
      children: [],
    }
    nodeMap.set(normalized, node)
    attachNode(node)
    return node
  }

  function attachNode(node: FileTreeNode) {
    const parentPath = node.path.includes('/')
      ? node.path.slice(0, node.path.lastIndexOf('/'))
      : ''

    if (!parentPath) {
      if (!rootNodes.includes(node)) {
        rootNodes.push(node)
      }
      return
    }

    const parent = ensureDirectory(parentPath)
    if (!parent.children.includes(node)) {
      parent.children.push(node)
    }
  }

  for (const entry of entries) {
    const normalizedPath = entry.path.replaceAll('\\', '/')
    if (!normalizedPath) {
      continue
    }

    const existing = nodeMap.get(normalizedPath)
    if (existing) {
      existing.type = entry.type
      existing.name = entry.name || existing.name
      continue
    }

    const node: FileTreeNode = {
      name: entry.name || normalizedPath.split('/').at(-1) || normalizedPath,
      path: normalizedPath,
      type: entry.type,
      children: [],
    }
    nodeMap.set(normalizedPath, node)
    attachNode(node)
  }

  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }

  sortNodes(rootNodes)
  return rootNodes
}

function readWorkspaceName(root: string) {
  return root.split(/[\\/]/u).filter(Boolean).at(-1) || root
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized
}

function loadPersistedAppState(): PersistedAppState {
  try {
    const raw = localStorage.getItem(APP_STATE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>

    return {
      view: isViewMode(parsed.view) ? parsed.view : undefined,
      settingsPanel: isSettingsPanel(parsed.settingsPanel)
        ? parsed.settingsPanel
        : undefined,
      workspaceRoot:
        typeof parsed.workspaceRoot === 'string'
          ? parsed.workspaceRoot
          : undefined,
      recentWorkspaceRoots: readStringArray(parsed.recentWorkspaceRoots),
      selectedFile:
        typeof parsed.selectedFile === 'string' ? parsed.selectedFile : undefined,
      openTabs: readStringArray(parsed.openTabs),
      messages: Array.isArray(parsed.messages) ? parsed.messages : undefined,
      actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
      input: typeof parsed.input === 'string' ? parsed.input : undefined,
      config: isProviderConfig(parsed.config) ? parsed.config : undefined,
      imageTemplates: normalizeImageTemplates(parsed.imageTemplates),
      activeImageTemplateId:
        typeof parsed.activeImageTemplateId === 'string'
          ? parsed.activeImageTemplateId
          : undefined,
      imageSource:
        typeof parsed.imageSource === 'string' ? parsed.imageSource : undefined,
      imagePrompt:
        typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt : undefined,
      imageWorkflowStatus:
        typeof parsed.imageWorkflowStatus === 'string'
          ? parsed.imageWorkflowStatus
          : undefined,
      imageResults: Array.isArray(parsed.imageResults)
        ? parsed.imageResults
            .map((item, index) => normalizeGeneratedImageRecord(item, index))
            .filter((item): item is GeneratedImageRecord => Boolean(item))
        : undefined,
      selectedImage:
        parsed.selectedImage && typeof parsed.selectedImage === 'object'
          ? normalizeGeneratedImageRecord(parsed.selectedImage, 0)
          : null,
      primarySidebarVisible:
        typeof parsed.primarySidebarVisible === 'boolean'
          ? parsed.primarySidebarVisible
          : undefined,
      primarySidebarWidth: readClampedNumber(
        parsed.primarySidebarWidth,
        PRIMARY_SIDEBAR_DEFAULT_WIDTH,
        PRIMARY_SIDEBAR_MIN_WIDTH,
        PRIMARY_SIDEBAR_MAX_WIDTH,
      ),
      assistantSidebarWidth: readClampedNumber(
        parsed.assistantSidebarWidth,
        ASSISTANT_SIDEBAR_DEFAULT_WIDTH,
        ASSISTANT_SIDEBAR_MIN_WIDTH,
        ASSISTANT_SIDEBAR_MAX_WIDTH,
      ),
      goalProgress: normalizeGoalProgress(parsed.goalProgress),
    }
  } catch {
    return {}
  }
}

function normalizeGoalProgress(value: unknown): GoalProgressState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Partial<GoalProgressState>
  const items = Array.isArray(record.items)
    ? record.items
        .map((item, index): GoalProgressItem | null => {
          if (!item || typeof item !== 'object') {
            return null
          }

          const itemRecord = item as Partial<GoalProgressItem>
          return {
            id:
              typeof itemRecord.id === 'string' && itemRecord.id
                ? itemRecord.id
                : `goal-step-${index + 1}`,
            title: typeof itemRecord.title === 'string' ? itemRecord.title : '',
            done: Boolean(itemRecord.done),
          }
        })
        .filter((item): item is GoalProgressItem => Boolean(item))
    : []

  return {
    projectGoal:
      typeof record.projectGoal === 'string' ? record.projectGoal : '',
    items: items.length ? items : createDefaultGoalProgress().items,
  }
}

function isViewMode(value: unknown): value is ViewMode {
  return (
    value === 'chat' ||
    value === 'settings' ||
    value === 'images' ||
    value === 'models'
  )
}

function isSettingsPanel(value: unknown): value is SettingsPanel {
  return value === 'base' || value === 'image'
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
}

function readClampedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampNumber(value, min, max)
    : fallback
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object') {
    return false
  }
  const config = value as ProviderConfig
  return (
    typeof config.profileId === 'string' &&
    typeof config.model === 'string' &&
    isReasoningEffort(config.reasoningEffort) &&
    typeof config.disableResponseStorage === 'boolean' &&
    typeof config.temperature === 'number' &&
    typeof config.maxOutputTokens === 'number'
  )
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  )
}

function normalizeImageTemplates(value: unknown): ImageTemplate[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const template = item as Partial<ImageTemplate>
      return {
        id:
          typeof template.id === 'string' && template.id.trim()
            ? template.id
            : `image-template-${index}`,
        name:
          typeof template.name === 'string' && template.name.trim()
            ? template.name
            : `图像模板 ${index + 1}`,
        config: normalizeImageConfigInput(template.config),
      }
    })
    .filter((item): item is ImageTemplate => Boolean(item))
}

function normalizeImageConfigInput(value: unknown): ImageGenerationConfigInput {
  if (!value || typeof value !== 'object') {
    return { ...defaultImageConfig }
  }
  const config = value as Partial<ImageGenerationConfigInput>

  return {
    baseUrl:
      typeof config.baseUrl === 'string' && config.baseUrl.trim()
        ? config.baseUrl
        : defaultImageConfig.baseUrl,
    model:
      typeof config.model === 'string' && config.model.trim()
        ? config.model
        : defaultImageConfig.model,
    size:
      typeof config.size === 'string' && config.size.trim()
        ? config.size
        : defaultImageConfig.size,
    quality:
      typeof config.quality === 'string' && config.quality.trim()
        ? config.quality
        : defaultImageConfig.quality,
    promptProfileId:
      typeof config.promptProfileId === 'string' ? config.promptProfileId : '',
    promptModel: typeof config.promptModel === 'string' ? config.promptModel : '',
    requiresOpenAiAuth:
      typeof config.requiresOpenAiAuth === 'boolean'
        ? config.requiresOpenAiAuth
        : defaultImageConfig.requiresOpenAiAuth,
    apiKey: '',
  }
}

function normalizeGeneratedImageRecord(
  value: unknown,
  index: number,
): GeneratedImageRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Partial<GeneratedImageRecord>
  const prompt = typeof record.prompt === 'string' ? record.prompt : ''
  const message = typeof record.message === 'string' ? record.message : ''

  if (!prompt && !record.imageUrl && !message) {
    return null
  }

  const source = typeof record.source === 'string' ? record.source : prompt
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt.trim()
      ? record.createdAt
      : ''
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title
      : extractImageTitle(source, prompt)

  return {
    prompt,
    imageUrl: normalizeGeneratedImageUrl(record.imageUrl),
    revisedPrompt:
      typeof record.revisedPrompt === 'string' ? record.revisedPrompt : undefined,
    message,
    id:
      typeof record.id === 'string' && record.id.trim()
        ? record.id
        : `legacy-image-${index}-${createdAt || title}`,
    title,
    source,
    createdAt: createdAt || new Date().toISOString(),
  }
}

function compactGeneratedImageRecord(
  record: GeneratedImageRecord,
): GeneratedImageRecord {
  return {
    ...record,
    imageUrl: record.imageUrl?.startsWith('data:') ? undefined : record.imageUrl,
  }
}

function normalizeGeneratedImageUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  const imageUrl = value.trim()
  if (!imageUrl.startsWith('file:')) {
    return imageUrl
  }

  try {
    const url = new URL(imageUrl)
    const pathParts = url.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
    const fileName = pathParts.at(-1)

    if (pathParts.includes('generated-images') && fileName) {
      return `hc-image://generated/${encodeURIComponent(fileName)}`
    }
  } catch {
    return imageUrl
  }

  return imageUrl
}

function extractImageTitle(source: string, prompt: string) {
  const sourceText = source.trim()
  const matchedSubject = sourceText.match(
    /(?:生成|画|做|创建|制作)(.+?)(?:的?提示词|提示词|图片|图像|照片|插画)?$/,
  )?.[1]
  const base = (matchedSubject || sourceText || prompt).trim()
  const cleaned = base
    .replace(/^(请|帮我|给我|我要|想要|帮忙|麻烦你)+/g, '')
    .replace(/^(生成|画|做|创建|制作)+/g, '')
    .replace(/^(一张|一个|一幅|一组|一些)+/g, '')
    .replace(/(的?提示词|提示词|图片|图像|照片|插画|海报)$/g, '')
    .replace(/[，。,.!！?？：:；;“”"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.slice(0, 18) || '生成图像'
}

function toDraft(profile: ProviderProfile): ProviderProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    defaultModel: profile.defaultModel,
    models: profile.models,
    protocol: profile.protocol,
    reasoningEffort: profile.reasoningEffort,
    disableResponseStorage: profile.disableResponseStorage,
    requiresOpenAiAuth: profile.requiresOpenAiAuth,
    apiKey: '',
  }
}

function toImageDraft(config: {
  baseUrl: string
  model: string
  size: string
  quality: string
  promptProfileId: string
  promptModel: string
  requiresOpenAiAuth: boolean
}): ImageGenerationConfigInput {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    size: config.size,
    quality: config.quality,
    promptProfileId: config.promptProfileId,
    promptModel: config.promptModel,
    requiresOpenAiAuth: config.requiresOpenAiAuth,
    apiKey: '',
  }
}

function upsertMessage(messages: ChatMessage[], message: ChatMessage) {
  return messages.some((item) => item.id === message.id)
    ? messages.map((item) => (item.id === message.id ? message : item))
    : [...messages, message]
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default App







