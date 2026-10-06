import { buildExportDatasets, exportCsv, exportKeys, type ExportData, type ExportKey, type ExportTerms } from './exportDatasets'
import type { ShareResult } from './exportNative'

type State = { owner: unknown; data: ExportData | null; loading: boolean; sharing: boolean; error: string; notice: string; cleanupFailed: boolean }
type Dependencies = {
  online: () => Promise<boolean>
  load: (signal: AbortSignal, current: () => boolean) => Promise<ExportData>
  share: (key: ExportKey, csv: string, current: () => boolean) => Promise<ShareResult>
  next: (key: ExportKey, current: () => boolean) => Promise<boolean>
}
const errorMessage = (reason: unknown) => {
  const status = reason && typeof reason === 'object' && 'status' in reason ? Number(reason.status) : 0
  return status === 403 ? 'Экспорт недоступен. Нужен тариф с доступом к статистике.' : status === 401 ? 'Сессия завершена. Войдите снова.' : 'Не удалось получить полный серверный набор. Повторите загрузку.'
}
export class ExportController {
  private active = false
  private epoch = 0
  private request: AbortController | null = null
  private locked = false
  private cancelWait: (() => void) | null = null
  private listeners = new Set<() => void>()
  state: State = { owner: null, data: null, loading: true, sharing: false, error: '', notice: '', cleanupFailed: false }
  constructor(private deps: Dependencies) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.state
  private set = (patch: Partial<State>) => { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  private current = (epoch: number) => this.active && this.epoch === epoch
  focus = (owner: unknown) => {
    this.active = Boolean(owner); ++this.epoch
    this.set({ owner, data: null, loading: Boolean(owner), error: '', notice: '', sharing: this.locked })
    if (owner) void this.load()
  }
  blur = () => { this.active = false; ++this.epoch; this.request?.abort(); this.cancelWait?.(); this.set({ data: null, notice: '' }) }
  load = async () => {
    if (!this.active || this.locked) return
    this.request?.abort()
    const epoch = ++this.epoch, request = new AbortController()
    this.request = request
    const current = () => this.current(epoch)
    this.set({ data: null, loading: true, error: '', notice: '' })
    try {
      const online = await this.deps.online()
      if (!current()) return
      if (!online) { this.set({ loading: false, error: 'Нет сети. Для полного экспорта нужны актуальные серверные данные.' }); return }
      const data = await this.deps.load(request.signal, current)
      if (current()) this.set({ data, loading: false })
    } catch (reason) { if (current()) this.set({ data: null, loading: false, error: errorMessage(reason) }) }
  }
  export = async (selected: ExportKey[], terms: ExportTerms) => {
    if (!this.active || this.locked || this.state.loading || !this.state.data) return
    const keys = exportKeys.filter(key => selected.includes(key))
    if (!keys.length) return
    const epoch = this.epoch, current = () => this.current(epoch)
    this.locked = true; this.set({ sharing: true, notice: '', error: '' })
    let opened = 0, cleanupFailed = false
    try {
      if (!await this.deps.online()) { if (current()) this.set({ error: 'Нет сети. Повторите загрузку данных перед экспортом.' }); return }
      if (!current()) return
      this.request?.abort()
      this.request = new AbortController()
      // Recheck tariff and read fresh exhaustive collections for each export.
      let data: ExportData
      try { data = await this.deps.load(this.request.signal, current) }
      catch (reason) { if (current()) this.set({ data: null, error: errorMessage(reason) }); return }
      if (!current()) return
      this.set({ data })
      const datasets = buildExportDatasets(data, terms)
      for (const key of keys) {
        if (!current()) return
        // An Android cancel is indistinguishable from a successful share.
        // Explicitly ask before opening the next selected file.
        if (opened) {
          const cancelled = new Promise<boolean>(resolve => { this.cancelWait = () => resolve(false) })
          const proceed = await Promise.race([this.deps.next(key, current), cancelled])
          this.cancelWait = null
          if (!proceed) break
        }
        if (!current()) return
        const result = await this.deps.share(key, exportCsv(datasets[key]), current)
        cleanupFailed ||= result.cleanupFailed
        if (result.opened) ++opened
        if (!current()) return
        if (result.error) { this.set({ error: 'Не удалось открыть передачу CSV. Можно повторить экспорт.' }); break }
        if (cleanupFailed) break
      }
      if (current()) this.set({ notice: `Окна передачи: ${opened} из ${keys.length}. Отправка файлов не подтверждена; окно можно закрыть без отправки.` })
    } catch { if (current()) this.set({ error: 'Не удалось подготовить CSV. Повторите загрузку данных.' }) }
    finally {
      this.locked = false
      // The lock is shared across focus/profile lifetimes. Release it without
      // publishing old data/results into the new profile.
      if (this.active) {
        this.set({ sharing: false, cleanupFailed: this.state.cleanupFailed || cleanupFailed })
        if (!current() && !this.state.data) void this.load()
      }
    }
  }
}
