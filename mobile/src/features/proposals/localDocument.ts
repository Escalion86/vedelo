import {
  editorJs,
  editorCss,
  previewJs,
  previewCss,
  utilitiesCss,
  richTextCss,
  fontCss,
} from './localAssets.generated'
import { lightPalette, darkPalette } from '../../shared/ui/theme'
import type { ProposalBlock } from './api'
export type LocalDocumentOptions =
  | {
      mode: 'editor'
      value?: string
      block?: ProposalBlock
      theme?: 'light' | 'dark'
      key?: string
      editable?: boolean
    }
  | { mode: 'preview'; data: Record<string, unknown>; key?: string }
export function buildLocalDocument(options: LocalDocumentOptions) {
  const payload =
    options.mode === 'editor' && options.block
      ? {
          ...options,
          block: {
            type: options.block.type,
            contentHtml: options.block.contentHtml,
            text: options.block.text,
            items: options.block.items,
          },
        }
      : options
  const config = JSON.stringify(payload)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  const p =
    options.mode === 'editor' && options.theme === 'dark'
      ? darkPalette
      : lightPalette
  const editor = options.mode === 'editor'
  const css = editor
    ? `body{background:${p.surface};color:${p.text};color-scheme:${p.mode}} .toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:8px;position:sticky;top:0;background:${p.surface};z-index:1;border-bottom:1px solid ${p.border}} button,select{min-height:48px;max-width:100%;padding:6px 10px;border:1px solid ${p.border};border-radius:4px;background:${p.secondaryBackground};color:${p.text};font:inherit;cursor:pointer} [contenteditable]{min-height:200px;padding:12px;outline:none;overflow-wrap:anywhere} blockquote{color:${p.text};border-color:${p.primary}} a{color:${p.primary}} ${editorCss}`
    : utilitiesCss + previewCss
  // Only the application-owned runtime can execute. Persisted HTML is sanitized
  // by the original sanitizer; it never becomes script, navigation or auth data.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-vedelo-local'; style-src 'unsafe-inline'; font-src data:; img-src https: http:; media-src https: http:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;max-width:100%;overflow-wrap:anywhere;font-family:'Inter Tight',system-ui,sans-serif}*{box-sizing:border-box}img,video{max-width:100%;height:auto} ${fontCss} ${richTextCss} ${css}</style></head><body><div id="root"></div><script nonce="vedelo-local">window.__VEDELO_LOCAL__=${config};${(editor ? editorJs : previewJs).replaceAll('</script', '<\\/script')}</script></body></html>`
}
