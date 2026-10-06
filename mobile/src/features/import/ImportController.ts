import { activeJob, draftMatches, eligible, initialDraft, quoteDraft, safeImportError, shortageKopecks, validId, type Draft, type Job, type JobSummary } from './contract'
import type { ImportAction } from './fileImportApi'
import type { OwnedImportFile } from './nativeFile'
export type ImportState = {
  job: Job | null; jobs: JobSummary[]; listLoaded: boolean; listError: string; busy: boolean; error: string; notice: string;
  draft: Draft; dirty: boolean; needsRead: boolean; requiresQuote: boolean; pollStopped: boolean; denied: boolean;
  file: OwnedImportFile | null; note: string; cleanupError: boolean; sync: 'none' | 'pending' | 'failed' | 'done'; stopRequested: boolean;
}
export type ImportDependencies = {
  list: () => Promise<JobSummary[]>; get: (id: string) => Promise<Job>; change: (id: string, action: ImportAction, extra?: { quoteId?: string } & Partial<Draft>) => Promise<Job>;
  upload: (file: OwnedImportFile, note: string) => Promise<{ job: Job; reused: boolean }>;
  pick: (onFailure: () => void) => Promise<OwnedImportFile | null>; online: () => Promise<boolean>;
  sync: (current: () => boolean) => Promise<void>; event: (id: string, requireLocal?: boolean) => Promise<string>; navigate: (id: string) => void;
}
export type RequestGate = { owner: symbol | null; wake?: () => void }
export type Confirmation = { epoch: number; version: number; snapshot: string; action: 'analyze' | 'start' | 'stop' | 'release' }
const emptyDraft = (): Draft => ({ answers: {}, selectedIds: [] })
const initial = (): ImportState => ({ job: null, jobs: [], listLoaded: false, listError: '', busy: false, error: '', notice: '', draft: emptyDraft(), dirty: false, needsRead: false, requiresQuote: false, pollStopped: false, denied: false, file: null, note: '', cleanupError: false, sync: 'none', stopRequested: false })
const unconfirmed = 'Ответ на действие не подтверждён. Прочитайте текущее задание. Его статус не доказывает исход именно этой попытки; платный повтор потребует нового расчёта и подтверждения.'
/** All requests, including read-back and sync, share a physical gate. Epochs
 * revoke results before any UI/cache/sync/navigation side effects. No outbox. */
export class ImportController {
  state = initial()
  private listeners = new Set<() => void>()
  private active = false
  private epoch = 0
  private version = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private initializing = false
  private operation = ''
  private targetId: string | null = null
  constructor(private deps: ImportDependencies, private gate: RequestGate = { owner: null }) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  snapshot = () => this.state
  private update(patch: Partial<ImportState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()) }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null }
  private current = (epoch: number) => this.active && this.epoch === epoch
  token = () => this.epoch
  isCurrent = (epoch: number) => this.current(epoch)
  focus(id?: string) {
    this.active = true; ++this.epoch; ++this.version
    this.gate.wake = () => { if (this.active && this.initializing) void initialize() }
    this.initializing = true
    this.update({ busy: Boolean(this.gate.owner), pollStopped: true, error: '', notice: '' })
    const initialize = async () => {
      if (!this.active || this.gate.owner) return
      this.initializing = false
      if (id !== undefined) {
        if (!validId(id)) { this.update({ error: 'Некорректный адрес импорта.', busy: false }); return }
        if (this.targetId === id) await this.read()
        else await this.open(id)
      } else if (this.state.job) await this.read()
      else await this.list()
      if (this.active && this.state.job && !this.state.denied && !this.state.needsRead) await this.list()
    }
    void initialize()
  }
  blur() {
    this.active = false; ++this.epoch; ++this.version; this.clearTimer()
    if (this.operation === 'mutation') this.update({ needsRead: true, requiresQuote: true, notice: unconfirmed })
    this.cleanupFile()
  }
  private cleanupFile() {
    const file = this.state.file
    if (file) { const ok = file.cleanup(); this.update({ file: null, cleanupError: this.state.cleanupError || !ok }) }
  }
  private schedule() {
    this.clearTimer()
    if (this.active && activeJob(this.state.job) && !this.state.pollStopped && !this.state.denied && !this.state.needsRead && Date.parse(this.state.job!.expiresAt) > Date.now()) {
      this.timer = setTimeout(() => { this.timer = null; void this.read() }, 4000)
    }
  }
  private fail(reason: unknown) {
    const r = reason as { status?: number; code?: string } | null
    const denied = r?.status === 403 || r?.status === 401 || r?.code === 'AI_ACCESS_REQUIRED'
    this.update({ error: safeImportError(reason), pollStopped: true, requiresQuote: true, ...(denied ? { denied: true, job: null, jobs: [], draft: emptyDraft(), dirty: false } : {}) })
  }
  private async run(name: string, work: (current: () => boolean) => Promise<void>) {
    if (!this.active || this.gate.owner) return
    const owner = Symbol(name), epoch = this.epoch
    this.gate.owner = owner; this.operation = name; this.clearTimer()
    this.update({ busy: true, error: '' })
    try { await work(() => this.current(epoch)) }
    catch (reason) { if (this.current(epoch)) this.fail(reason) }
    finally {
      this.operation = ''
      if (this.gate.owner === owner) this.gate.owner = null
      if (this.current(epoch)) { this.update({ busy: false }); this.schedule() }
      this.gate.wake?.()
    }
  }
  private async online() { if (!await this.deps.online()) throw new Error('OFFLINE') }
  private accept(job: Job, reset = false) {
    const change = this.targetId !== job.id
    this.targetId = job.id
    const draft = reset || change || !this.state.dirty ? initialDraft(job) : this.state.draft
    ++this.version
    this.update({ job, draft, ...(reset || change ? { dirty: false } : {}), denied: false, pollStopped: false, ...(reset ? { requiresQuote: ['failed', 'paused', 'completed'].includes(job.status) } : {}),
      ...(change ? { sync: 'none', stopRequested: false, requiresQuote: ['failed', 'paused', 'completed'].includes(job.status) } : {}) })
  }
  list = async () => this.run('list', async (current) => {
    try { await this.online(); if (!current()) return; const jobs = await this.deps.list(); if (current()) this.update({ jobs, listLoaded: true, listError: '', denied: false }) }
    catch (reason) { if (current()) { this.update({ listLoaded: true, listError: safeImportError(reason) }); this.fail(reason) } }
  })
  open = async (id: string) => {
    if (!validId(id) || this.state.dirty || this.state.note || this.state.file || this.gate.owner) return
    ++this.epoch; ++this.version; this.clearTimer()
    this.targetId = id
    this.update({ job: null, draft: emptyDraft(), sync: 'none', notice: '', stopRequested: false, requiresQuote: false, needsRead: true })
    await this.run('read', async (current) => { await this.online(); if (!current()) return; const job = await this.deps.get(id); if (current()) { this.accept(job, true); this.update({ needsRead: false }); await this.syncIfFinished(current) } })
  }
  read = async () => this.run('read', async (current) => {
    const id = this.state.job?.id || this.targetId
    if (!id) { await this.online(); if (!current()) return; const jobs = await this.deps.list(); if (current()) this.update({ jobs, listLoaded: true, listError: '', denied: false }); return }
    await this.online(); if (!current()) return
    const next = await this.deps.get(id)
    if (!current()) return
    const uncertain = this.state.needsRead
    this.accept(next); this.update({ needsRead: false, ...(uncertain ? { requiresQuote: true, notice: 'Текущее состояние прочитано. Исход отдельной попытки не доказан. Для нового запуска получите новую смету.' } : {}) })
    await this.syncIfFinished(current)
  })
  setAnswer(id: string, value: string) {
    if (!this.active || this.state.busy || activeJob(this.state.job) || this.state.denied) return
    ++this.version
    this.update({ draft: { ...this.state.draft, answers: { ...this.state.draft.answers, [id]: value } }, dirty: true, requiresQuote: true, notice: '' })
  }
  toggle(id: string) {
    if (!this.active || this.state.busy || activeJob(this.state.job) || !this.state.job?.records.some((r) => r.id === id && eligible(r))) return
    ++this.version
    const ids = this.state.draft.selectedIds
    this.update({ draft: { ...this.state.draft, selectedIds: ids.includes(id) ? ids.filter((s) => s !== id) : [...ids, id] }, dirty: true, requiresQuote: true, notice: '' })
  }
  setNote(value: string) { if (!this.state.busy) { ++this.version; this.update({ note: value }) } }
  discardDraft() { ++this.version; this.update({ dirty: false, draft: this.state.job ? initialDraft(this.state.job) : emptyDraft(), note: '', requiresQuote: true }) }
  newFile() {
    if (this.gate.owner || this.state.dirty || this.state.note) return
    ++this.epoch; ++this.version; this.clearTimer(); this.cleanupFile(); this.targetId = null
    this.update({ job: null, draft: emptyDraft(), needsRead: false, requiresQuote: false, notice: '', sync: 'none', error: '', stopRequested: false })
  }
  pick = async () => this.run('pick', async (current) => {
    const file = await this.deps.pick(() => { if (current()) this.update({ cleanupError: true }) })
    if (!current()) { file?.cleanup(); return }
    if (file) { this.cleanupFile(); this.update({ file }) }
  })
  upload = async () => this.run('upload', async (current) => {
    const file = this.state.file
    if (!file) return
    try {
      await this.online(); if (!current()) return
      const result = await this.deps.upload(file, this.state.note)
      if (!current()) return
      // Upload is free; exact GET confirms even a reused job before showing it.
      this.accept(result.job, true); this.update({ note: '', needsRead: true })
      const read = await this.deps.get(result.job.id)
      if (!current()) return
      this.accept(read, true); this.update({ needsRead: false, notice: result.reused ? 'Открыт ранее сохранённый импорт этого содержимого.' : 'Файл проверен бесплатно. Анализ требует отдельного подтверждения.' })
      await this.syncIfFinished(current)
    } finally { const cleaned = file.cleanup(); if (current()) this.update({ file: null, cleanupError: this.state.cleanupError || !cleaned }) }
  })
  private signature() { const s = this.state; return JSON.stringify([s.job, s.draft, s.requiresQuote, s.needsRead]) }
  confirmation(action: Confirmation['action']): Confirmation | null {
    const s = this.state, j = s.job
    if (!this.active || this.gate.owner || s.busy || s.denied || s.needsRead || !j) return null
    if (action === 'stop' && !activeJob(j)) return null
    if (action === 'release' && (!j.refundPending || activeJob(j))) return null
    if (action === 'start' || action === 'analyze') {
      if (activeJob(j) || s.requiresQuote || s.dirty || !j.quote || shortageKopecks(j) > 0 || Date.parse(j.expiresAt) <= Date.now()) return null
      if (action === 'analyze' && (j.analysis || j.quote.phase !== 'analysis')) return null
      if (action === 'start' && (j.status !== 'quoted' || j.quote.phase !== 'import' || !draftMatches(s.draft, initialDraft(j)) || !s.draft.selectedIds.length)) return null
    }
    return { action, epoch: this.epoch, version: this.version, snapshot: this.signature() }
  }
  confirm = async (c: Confirmation) => {
    if (!this.current(c.epoch) || c.version !== this.version || c.snapshot !== this.signature() || !this.confirmation(c.action)) return
    await this.action(c.action)
  }
  quote = async () => {
    if (!this.state.job || this.state.needsRead || this.state.denied || activeJob(this.state.job)) return
    try { const draft = quoteDraft(this.state.job, this.state.draft); await this.action('quote', draft) }
    catch (reason) { this.fail(reason) }
  }
  refreshQuote = async () => { if (!this.state.needsRead && !activeJob(this.state.job) && !this.state.denied) await this.action('refresh') }
  private action = async (action: ImportAction, draft?: Draft) => this.run('mutation', async (current) => {
    const job = this.state.job
    if (!job) return
    let issued = false, readAttempted = false
    try {
      await this.online(); if (!current()) return
      issued = true; ++this.version
      this.update({ needsRead: true, requiresQuote: true, notice: '', ...(action === 'start' ? { sync: 'none' as const } : {}) })
      const receipt = await this.deps.change(job.id, action, draft || { quoteId: job.quote?.id })
      if (!current()) return
      readAttempted = true
      const next = await this.deps.get(job.id)
      if (!current()) return
      if ((action === 'quote' && (!draftMatches(initialDraft(next), draft!) || next.quote?.id !== receipt.quote?.id || next.quote?.id === job.quote?.id || next.status !== 'quoted' || next.quote?.phase !== 'import' || next.quote?.count !== draft!.selectedIds.length)) ||
          (action === 'refresh' && (next.quote?.id !== receipt.quote?.id || next.quote?.id === job.quote?.id)) ||
          (action === 'analyze' && !['analyzing', 'review', 'failed'].includes(next.status)) ||
          (action === 'start' && !['importing', 'paused', 'completed'].includes(next.status)) ||
          (action === 'release' && next.refundPending)) throw new Error('READ_BACK_MISMATCH')
      this.accept(next, action === 'quote')
      this.update({ needsRead: false, requiresQuote: !['quote', 'refresh'].includes(action),
        ...(action === 'stop' ? { stopRequested: true } : action === 'start' || action === 'analyze' ? { stopRequested: false } : {}),
        notice: action === 'stop' ? 'Запрос остановки передан. Дождитесь серверного статуса; текущая операция может завершиться.' : action === 'release' ? 'Возврат остатка подтверждён. Задание сохранено.' : action === 'quote' || action === 'refresh' ? 'Новая смета прочитана с сервера. Запуск требует явного подтверждения.' : 'Сервер принял запуск; прочитано текущее состояние задания.' })
      await this.syncIfFinished(current)
    } catch (reason) {
      if (!current()) return
      if (issued) this.update({ needsRead: true, requiresQuote: true, notice: unconfirmed })
      this.fail(reason)
      const denied = (reason as { status?: number; code?: string })?.status === 403 || (reason as { status?: number })?.status === 401 || (reason as { code?: string })?.code === 'AI_ACCESS_REQUIRED'
      if (issued && !readAttempted && !denied) {
        // One recovery read after a lost POST response. Never replay the POST or
        // attribute an arbitrary job status to this individual attempt.
        try { const next = await this.deps.get(job.id); if (current()) { this.accept(next); this.update({ needsRead: false, requiresQuote: true, notice: unconfirmed, pollStopped: true }); await this.syncIfFinished(current) } }
        catch (readReason) { if (current()) this.fail(readReason) }
      }
    }
  })
  private async syncIfFinished(current: () => boolean, force = false) {
    const j = this.state.job
    if (!j || (!force && !['completed', 'paused'].includes(j.status)) || !current() || this.state.sync === 'done' || (!force && this.state.sync === 'failed')) return
    this.update({ sync: 'pending' })
    try { await this.online(); if (!current()) return; await this.deps.sync(current); if (current()) this.update({ sync: 'done' }) }
    catch { if (current()) this.update({ sync: 'failed' }) }
  }
  retrySync = async () => this.run('sync', async (current) => this.syncIfFinished(current, true))
  openEvent = async (recordId: string) => this.run('event', async (current) => {
    const record = this.state.job?.records.find((r) => r.id === recordId)
    if (!record || !['created', 'duplicate', 'possible_duplicate'].includes(record.status) || !validId(record.eventId) || this.state.needsRead || this.state.denied) return
    await this.online(); if (!current()) return
    const id = await this.deps.event(record.eventId)
    if (!current() || id !== record.eventId) return
    this.update({ sync: 'pending' })
    try { await this.deps.sync(current) } catch { if (current()) this.update({ sync: 'failed', error: 'Карточка доступна на сервере, но локальная синхронизация не выполнена.' }); return }
    if (!current()) return
    this.update({ sync: 'done' })
    // Availability is checked again after sync, including deletion during pull.
    const stillAvailable = await this.deps.event(id, true)
    if (!current() || stillAvailable !== id) return
    this.update({ sync: 'done' }); this.deps.navigate(id)
  })
}
