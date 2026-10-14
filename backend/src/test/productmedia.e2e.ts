// Product media: video validation, Cloudinary video delivery URLs, and the
// browser-side upload checks (empty-type fallback, HEIC detection).
// Pure-function coverage — no database, no network.
//
// Run: npm run test:productmedia --workspace @glamirk/backend
import assert from 'node:assert/strict';
import { validateProductVideos, MAX_PRODUCT_VIDEOS } from '@glamirk/shared/utils/productValidation';
import { cloudinaryVideoUrl, cloudinaryVideoPoster } from '@glamirk/shared/utils/cloudinaryVideo';
import { effectiveMimeType, isHeicFile } from '@glamirk/shared/utils/uploadFile';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${(err as Error).message}`);
  }
}

const CLD = 'https://res.cloudinary.com/demo/video/upload/v1700000000/glamirk-beauty/clip.mov';
const v = (o: Record<string, unknown> = {}) => ({ id: 'v1', url: CLD, ...o });

// --- validateProductVideos -----------------------------------------------
test('no videos field is fine (older products)', () => assert.equal(validateProductVideos({}), null));
test('empty list is fine', () => assert.equal(validateProductVideos({ videos: [] }), null));
test('a cloudinary video is fine', () => assert.equal(validateProductVideos({ videos: [v()] }), null));
test('site path is fine', () => assert.equal(validateProductVideos({ videos: [v({ url: '/media/a.mp4' })] }), null));
test('javascript: url is rejected', () => assert.match(validateProductVideos({ videos: [v({ url: 'javascript:alert(1)' })] })!, /https/));
test('data: url is rejected', () => assert.ok(validateProductVideos({ videos: [v({ url: 'data:video/mp4;base64,AAAA' })] })));
test('protocol-relative url is rejected', () => assert.ok(validateProductVideos({ videos: [v({ url: '//evil.example/x.mp4' })] })));
test('blank url is rejected with a fix-it message', () => assert.match(validateProductVideos({ videos: [v({ url: ' ' })] })!, /upload one or remove/));
test('bad poster is rejected', () => assert.match(validateProductVideos({ videos: [v({ posterUrl: 'javascript:x' })] })!, /poster/));
test('duplicate ids are rejected', () => assert.match(validateProductVideos({ videos: [v(), v()] })!, /twice/));
test('missing id is rejected', () => assert.ok(validateProductVideos({ videos: [v({ id: '' })] })));
test('over the cap is rejected', () => {
  const many = Array.from({ length: MAX_PRODUCT_VIDEOS + 1 }, (_, i) => v({ id: `v${i}` }));
  assert.match(validateProductVideos({ videos: many })!, /at most/);
});
test('non-array is rejected', () => assert.ok(validateProductVideos({ videos: 'x' as any })));
test('long title is rejected', () => assert.ok(validateProductVideos({ videos: [v({ title: 'x'.repeat(81) })] })));

// --- cloudinaryVideoUrl / Poster -----------------------------------------
test('adds f_auto,q_auto to a cloudinary video', () =>
  assert.equal(cloudinaryVideoUrl(CLD), 'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1700000000/glamirk-beauty/clip.mov'));
test('already-transformed url is left alone', () => {
  const t = 'https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/x.mp4';
  assert.equal(cloudinaryVideoUrl(t), t);
});
test('non-cloudinary url passes through', () => assert.equal(cloudinaryVideoUrl('https://cdn.example.com/a.mp4'), 'https://cdn.example.com/a.mp4'));
test('look-alike host is not treated as cloudinary', () =>
  assert.equal(cloudinaryVideoUrl('https://res.cloudinary.com.evil.test/demo/video/upload/v1/a.mp4'), 'https://res.cloudinary.com.evil.test/demo/video/upload/v1/a.mp4'));
test('image upload url is not rewritten as video', () => {
  const img = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';
  assert.equal(cloudinaryVideoUrl(img), img);
  assert.equal(cloudinaryVideoPoster(img), '');
});
test('poster is a first-frame jpg', () =>
  assert.equal(
    cloudinaryVideoPoster(CLD),
    'https://res.cloudinary.com/demo/video/upload/so_0,f_jpg,q_auto,w_600,c_limit/v1700000000/glamirk-beauty/clip.jpg'
  ));
test('poster of non-cloudinary is empty', () => assert.equal(cloudinaryVideoPoster('https://cdn.example.com/a.mp4'), ''));
test('nullish input is safe', () => {
  assert.equal(cloudinaryVideoUrl(undefined), '');
  assert.equal(cloudinaryVideoPoster(null), '');
});

// --- upload checks -------------------------------------------------------
test('browser-reported type wins', () => assert.equal(effectiveMimeType({ name: 'a.png', type: 'image/png' }), 'image/png'));
test('empty type falls back to extension (.webp)', () => assert.equal(effectiveMimeType({ name: 'Photo.WEBP', type: '' }), 'image/webp'));
test('empty type falls back to extension (.jfif)', () => assert.equal(effectiveMimeType({ name: 'download.jfif', type: '' }), 'image/jpeg'));
test('empty type falls back to extension (.mov)', () => assert.equal(effectiveMimeType({ name: 'IMG_0001.MOV', type: '' }), 'video/quicktime'));
test('unknown extension stays unknown', () => assert.equal(effectiveMimeType({ name: 'notes.txt', type: '' }), ''));
test('HEIC by type', () => assert.equal(isHeicFile({ name: 'x', type: 'image/heic' }), true));
test('HEIF by extension', () => assert.equal(isHeicFile({ name: 'IMG_1.HEIF', type: '' }), true));
test('JPEG is not HEIC', () => assert.equal(isHeicFile({ name: 'a.jpg', type: 'image/jpeg' }), false));

console.log(`productmedia: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
