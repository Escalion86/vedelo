import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveUploadedFileUrl } from './escalionCloudUpload.mjs'
import { resolveNewsUploadUrl } from './newsRichText.mjs'

test('uploaded file url prefers the explicit cloud url from the response', () => {
  const url = resolveUploadedFileUrl(
    { data: [{ url: 'https://cloud.escalion.ru/uploads/artistcrm/t/a.jpg' }] },
    { directory: 'proposal-templates/1' }
  )
  assert.equal(url, 'https://cloud.escalion.ru/uploads/artistcrm/t/a.jpg')
})

test('uploaded file url accepts relative cloud paths with tenant segment', () => {
  assert.equal(
    resolveUploadedFileUrl(
      { data: [{ path: 'artistcrm/tenant/proposal-templates/1/photo.jpg' }] },
      { directory: 'proposal-templates/1' }
    ),
    'https://cloud.escalion.ru/uploads/artistcrm/tenant/proposal-templates/1/photo.jpg'
  )
  assert.equal(
    resolveUploadedFileUrl(
      { data: [{ fileUrl: '/uploads/artistcrm/tenant/proposals/2/clip.mp4' }] },
      { directory: 'proposals/2' }
    ),
    'https://cloud.escalion.ru/uploads/artistcrm/tenant/proposals/2/clip.mp4'
  )
})

test('uploaded file url builds a path from a bare file name', () => {
  assert.equal(
    resolveUploadedFileUrl('clip.mp4', { directory: 'proposals/2' }),
    'https://cloud.escalion.ru/uploads/artistcrm/proposals/2/clip.mp4'
  )
  assert.equal(
    resolveUploadedFileUrl(
      { data: [{ fileName: 'a b.jpg' }] },
      {
        directory: 'proposal-templates/1',
      }
    ),
    'https://cloud.escalion.ru/uploads/artistcrm/proposal-templates/1/a%20b.jpg'
  )
})

test('uploaded file url ignores unsupported values', () => {
  assert.equal(
    resolveUploadedFileUrl({ data: [{ url: 'javascript:alert(1)' }] }),
    ''
  )
  assert.equal(resolveUploadedFileUrl(null), '')
})

test('news resolver keeps its own default directory', () => {
  assert.equal(
    resolveNewsUploadUrl({ data: [{ fileName: 'pic.png' }] }),
    'https://cloud.escalion.ru/uploads/artistcrm/news/draft/pic.png'
  )
})
