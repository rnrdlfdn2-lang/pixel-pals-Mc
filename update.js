// 업데이트 확인/내려받기 (GitHub Releases 기준). 화면(대화상자)과 분리해서 시험할 수 있게 순수 로직만 둔다.
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path'), { URL } = require('url');

const API = () => process.env.PIXELPALS_UPDATE_API || 'https://api.github.com';           // (시험용) 가짜 서버 주소
const TEST = () => !!process.env.PIXELPALS_UPDATE_API;
const GITHUB_HOSTS = [/^github\.com$/, /(^|\.)githubusercontent\.com$/];

const verOf = (tag) => String(tag || '').replace(/^v/i, '').trim();
const cmp = (a, b) => { const x = verOf(a).split('.').map(Number), y = verOf(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
const isNewer = (latest, current) => cmp(latest, current) > 0;

// 어떤 저장소의 릴리스를 볼지: 빌드할 때 자동으로 만들어지는 update-source.json 의 repo, 없으면 config.json 의 updateRepo ("소유자/저장소")
function repoFrom(dir, cfg = {}) {
  let repo = ''; try { repo = JSON.parse(fs.readFileSync(path.join(dir, 'update-source.json'), 'utf8')).repo || ''; } catch {}
  repo = repo || cfg.updateRepo || ''; return /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : '';
}

function getJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(u, { headers: { 'User-Agent': 'DDuknip-friends-updater', Accept: 'application/vnd.github+json' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(new Error('응답이 너무 큼')); }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('시간 초과'))); req.on('error', reject);
  });
}

async function fetchLatest(repo) {
  const r = await getJson(`${API()}/repos/${repo}/releases/latest`);
  return { version: verOf(r.tag_name), notes: String(r.body || '').slice(0, 600), page: r.html_url, assets: (r.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
}

// 내 컴퓨터에 맞는 설치 파일 고르기: Windows = *-win-x64.exe, Mac = *-mac-arm64.dmg(M1~) / *-mac-x64.dmg(인텔)
function pickAsset(assets, platform, arch) {
  const want = platform === 'win32' ? '-win-x64.exe' : platform === 'darwin' ? (arch === 'arm64' ? '-mac-arm64.dmg' : '-mac-x64.dmg') : null;
  return want ? assets.find((a) => a.name.endsWith(want)) || null : null;
}

const hostOk = (u) => TEST() ? ['127.0.0.1', 'localhost'].includes(u.hostname) : u.protocol === 'https:' && GITHUB_HOSTS.some((re) => re.test(u.hostname));

// 내려받기: 리다이렉트를 따라가되 GitHub 주소만 허용, 진행률 콜백, 크기 확인
function download(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(url); } catch { return reject(new Error('잘못된 주소')); }
    if (!hostOk(u)) return reject(new Error('허용되지 않은 주소: ' + u.hostname));
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(u, { headers: { 'User-Agent': 'DDuknip-friends-updater' }, timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume(); if (redirects >= 5) return reject(new Error('리다이렉트가 너무 많음'));
        return download(new URL(res.headers.location, u).toString(), dest, onProgress, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = Number(res.headers['content-length']) || 0; let got = 0; fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.part', out = fs.createWriteStream(tmp);
      res.on('data', (c) => { got += c.length; if (onProgress) onProgress(got, total); });
      res.pipe(out);
      out.on('finish', () => out.close(() => {
        if (total && got !== total) { try { fs.unlinkSync(tmp); } catch {} return reject(new Error('다운로드가 중간에 끊겼어요')); }
        fs.renameSync(tmp, dest); resolve(dest);
      }));
      res.on('error', (e) => { try { fs.unlinkSync(tmp); } catch {} reject(e); }); out.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('시간 초과'))); req.on('error', reject);
  });
}

// 설치 시작: Windows 는 설치 파일을 실행(앱이 종료되면 설치되고 다시 켜짐), Mac 은 dmg 를 열어 줌
function runInstaller(file, { platform, spawn, shell, onError }) {
  if (platform === 'win32') { const p = spawn(file, [], { detached: true, stdio: 'ignore' }); p.on('error', (e) => onError && onError(e)); p.unref(); return 'spawned'; }
  shell.openPath(file); return 'opened';
}

module.exports = { verOf, cmp, isNewer, repoFrom, fetchLatest, pickAsset, download, runInstaller, hostOk };
