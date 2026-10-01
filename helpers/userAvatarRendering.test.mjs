import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('avatar in the user view loads the same way as on the user card', async () => {
  const [viewSource, gallerySource, itemCardsSource] = await Promise.all([
    readFile('layouts/modals/modalsFunc/userViewFunc.js', 'utf8'),
    readFile('components/ImageGallery.js', 'utf8'),
    readFile('components/ItemCards.js', 'utf8'),
  ])

  // Аватар пользователя приходит с внешнего CDN (VK). Серверный оптимизатор
  // next/image не может его получить, поэтому аватар пользователя грузится
  // браузером напрямую — как на карточке, в Avatar и в списках выбора.
  assert.match(
    viewSource,
    /<ImageGallery images=\{user\?\.images\} unoptimized \/>/
  )
  assert.match(gallerySource, /unoptimized = false/)
  assert.equal(
    (gallerySource.match(/unoptimized=\{unoptimized\}/g) || []).length,
    2,
    'unoptimized должен передаваться в next/image в обеих ветках галереи'
  )
  // null/undefined вместо списка изображений не должны ломать рендер.
  assert.match(gallerySource, /Array\.isArray\(images\) \? images : \[\]/)

  const userAvatarImage = itemCardsSource
    .split('\n')
    .findIndex((line) => line.includes('getUserAvatarSrc(item)'))
  assert.notEqual(userAvatarImage, -1, 'UserItem должен показывать аватар')
  assert.match(
    itemCardsSource.split('\n').slice(userAvatarImage, userAvatarImage + 8).join('\n'),
    /unoptimized/,
    'аватар в UserItem тоже не должен идти через оптимизатор'
  )
})

