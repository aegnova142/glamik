/**
 * Media upload endpoint — over real HTTP.
 *
 *   DATABASE_URL=postgres://user:pw@localhost:55432/glamirk_test \
 *     npx tsx src/test/mediauploadapi.e2e.ts
 *
 * mediaupload.e2e.ts proves the validation RULES are right. This proves they
 * are actually WIRED UP: that a renamed executable posted as real multipart
 * form data to the real route, through the real multer middleware and the
 * real admin auth, comes back as a clean 400 with a sentence an admin can
 * read — and not as Express's default HTML stack trace, which is what an
 * unhandled multer error produces.
 *
 * Every case here returns BEFORE Cloudinary is contacted, so this test
 * reaches no external service and uploads nothing. The success path needs
 * real credentials and is verified separately; what it would add over the
 * unit tests is Cloudinary's own behaviour, not ours.
 */
const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/test/i.test(url)) {
  // The same guard migration013 uses. This test logs in as the seeded admin
  // and writes to cms_state; pointing it at a real database would be a write
  // to live content.
  console.error('\nREFUSING TO RUN — DATABASE_URL must be a local database whose name contains "test".\n');
  process.exit(1);
}
process.env.NODE_ENV = 'test';

import express from 'express';
import adminRoutes from '../routes/admin.routes';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

/** Smallest structurally valid PNG header. See mediaupload.e2e.ts. */
function pngFixture(w: number, h: number): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf;
}

const app = express();
app.use(express.json());
app.use('/api', adminRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;

async function postFile(token: string | null, filename: string, bytes: Buffer, contentType = 'image/png') {
  const form = new FormData();
  // The declared content type is deliberately a lie in most cases below —
  // that is the thing being tested.
  form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), filename);
  return fetch(`${base}/admin/media/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

async function run(): Promise<void> {
  // ========================================
  section('Authentication is required before anything is read');
  // ========================================

  const anon = await postFile(null, 'logo.png', pngFixture(10, 10));
  check('an unauthenticated upload is refused', anon.status === 401 || anon.status === 403, String(anon.status));

  const forged = await postFile('not-a-real-token', 'logo.png', pngFixture(10, 10));
  check('a forged bearer token is refused', forged.status === 401 || forged.status === 403, String(forged.status));

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'shelja.sharma@glamirk.com', password: 'QAZPLMoknwsx$#@980' }),
  });
  const loginBody: any = await login.json().catch(() => ({}));
  const token: string | undefined = loginBody?.token;
  check('the seeded admin can sign in', login.status === 200 && !!token, String(login.status));
  if (!token) {
    console.error('\nCannot continue without an admin token.\n');
    server.close();
    process.exit(1);
  }

  // ========================================
  section('Refusals are clean JSON, with the right status');
  // ========================================

  const cases: { label: string; filename: string; bytes: Buffer; type: string; status: number }[] = [
    {
      label: 'an executable renamed to .png and posted as image/png',
      filename: 'logo.png',
      bytes: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]),
      type: 'image/png',
      status: 400,
    },
    { label: 'a text file', filename: 'notes.txt', bytes: Buffer.from('not an image, just notes'.padEnd(64)), type: 'text/plain', status: 400 },
    { label: 'a PDF', filename: 'doc.pdf', bytes: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0)]), type: 'application/pdf', status: 400 },
    {
      label: 'an HTML page posted as image/jpeg',
      filename: 'x.html',
      bytes: Buffer.from('<!DOCTYPE html><html><body>x</body></html>'.padEnd(64)),
      type: 'image/jpeg',
      status: 400,
    },
    { label: 'a ZIP archive', filename: 'a.zip', bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0)]), type: 'application/zip', status: 400 },
    { label: 'a corrupted PNG', filename: 'broken.png', bytes: pngFixture(10, 10).subarray(0, 20), type: 'image/png', status: 400 },
    { label: 'PNG bytes named .jpg', filename: 'photo.jpg', bytes: pngFixture(10, 10), type: 'image/jpeg', status: 400 },
    {
      label: 'a 21 MB image',
      filename: 'huge.png',
      bytes: Buffer.concat([pngFixture(10, 10), Buffer.alloc(21 * 1024 * 1024, 0)]),
      type: 'image/png',
      status: 413,
    },
  ];

  for (const c of cases) {
    const res = await postFile(token, c.filename, c.bytes, c.type);
    const body: any = await res.json().catch(() => null);
    check(`${c.label} → ${c.status}`, res.status === c.status, `got ${res.status}`);
    check(
      '   ...the body is JSON, not an HTML error page',
      body !== null && typeof body.error === 'string',
      String(res.headers.get('content-type'))
    );
    check(
      '   ...and the message is written for an admin',
      typeof body?.error === 'string' && body.error.length > 10 && !/\bat \b|Error:|undefined/.test(body.error),
      JSON.stringify(body?.error)
    );
  }

  // ========================================
  section('The multer ceiling itself fails cleanly');
  // ========================================

  // Over the 60 MB video limit, so multer aborts before the handler runs.
  // This is the case that used to produce an HTML 500 with a stack trace.
  const giant = await postFile(
    token,
    'giant.png',
    Buffer.concat([pngFixture(10, 10), Buffer.alloc(61 * 1024 * 1024, 0)]),
    'image/png'
  );
  const giantBody: any = await giant.json().catch(() => null);
  check('a 61 MB upload is refused with 413', giant.status === 413, String(giant.status));
  check('   ...as JSON rather than an HTML stack trace', giantBody !== null && typeof giantBody.error === 'string');

  const noFile = await fetch(`${base}/admin/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: new FormData(),
  });
  const noFileBody: any = await noFile.json().catch(() => null);
  check('a request with no file at all is a clean 400', noFile.status === 400, String(noFile.status));
  check('   ...with a message saying so', /no file/i.test(noFileBody?.error || ''), JSON.stringify(noFileBody));

  // ========================================
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${'='.repeat(64)}\n`);
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Harness crashed:', err);
  server.close();
  process.exit(1);
});
