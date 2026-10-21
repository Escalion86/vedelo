import test from 'node:test'
import assert from 'node:assert/strict'
import { getProposalVideoEmbed as embed } from '../helpers/proposalVideoEmbed.mjs'

test('YouTube watch, short, shorts, live and embed links use the same player', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&autoplay=1',
    'https://youtu.be/M7lc1UVf-VE?si=tracking',
    'https://m.youtube.com/shorts/M7lc1UVf-VE',
    'https://youtube.com/live/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  ]) assert.equal(embed(url)?.src, 'https://www.youtube.com/embed/M7lc1UVf-VE')
})

test('Vimeo preserves unlisted access key without arbitrary parameters', () => {
  assert.equal(embed('https://vimeo.com/123456789/abc123')?.src, 'https://player.vimeo.com/video/123456789?h=abc123')
  assert.equal(embed('https://player.vimeo.com/video/123456789?h=abc123&autoplay=1')?.src, 'https://player.vimeo.com/video/123456789?h=abc123')
  assert.equal(embed('https://vimeo.com/channels/staffpicks/123456789')?.src, 'https://player.vimeo.com/video/123456789')
})

test('Rutube supports video, shorts, embed and private access parameter', () => {
  const id = 'a'.repeat(32)
  for (const path of ['video', 'shorts', 'play/embed'])
    assert.equal(embed(`https://rutube.ru/${path}/${id}/?p=secret&autoplay=1`)?.src, `https://rutube.ru/play/embed/${id}/?p=secret`)
})

test('VK uses owner/video IDs and keeps embed hash', () => {
  for (const url of ['https://vk.com/video-123_456', 'https://vkvideo.ru/video-123_456', 'https://m.vk.com/video?z=video-123_456%2Falbum'])
    assert.equal(embed(url)?.src, 'https://vk.com/video_ext.php?oid=-123&id=456')
  assert.equal(embed('https://vkvideo.ru/video_ext.php?oid=-123&id=456&hash=abc&autoplay=1')?.src, 'https://vk.com/video_ext.php?oid=-123&id=456&hash=abc')
})

test('no arbitrary hosts, credentials, ports, protocols or non-video paths in iframe', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,test', 'ftp://vimeo.com/123',
    'https://vimeo.com.evil.test/123', 'https://evil.test/?url=https://vimeo.com/123',
    'https://user:password@vimeo.com/123', 'https://vimeo.com:8080/123',
    'https://youtube.com/watch?v=bad', 'https://youtube.com/redirect?v=M7lc1UVf-VE',
    'https://vk.com/feed', 'https://rutube.ru/channel/123', 'https://vimeo.com/',
    'https://player.vimeo.com/video/123%22onload=alert(1)', null, '',
  ]) assert.equal(embed(url), null, String(url))
})
