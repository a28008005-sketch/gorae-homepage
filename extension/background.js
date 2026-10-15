/* 고래영어 성적 연동 — 뒤에서 실제로 보내는 곳 (서비스 워커)
 *
 * 팝업은 창을 옮기면 바로 닫혀 버려서, 보내는 일은 모두 여기서 합니다.
 *
 * 보내는 방법 두 가지
 *  - app (기본) : 원생관리 화면(staff.whalejinju.kr)을 열고 bridge.js 로 넘겨 줍니다. 서버가 필요 없습니다.
 *  - api        : 직접 만든 대시보드 서버 주소로 POST 합니다.
 *                 확장 프로그램의 서비스 워커가 보내고, 그 주소에 대한 접근 허락을 받아 두므로
 *                 서버 쪽에 CORS 설정이 없어도 막히지 않습니다.
 */
'use strict';

var DEFAULTS = {
  mode: 'app',
  appUrl: 'https://staff.whalejinju.kr/',
  apiUrl: '',
  apiToken: ''
};

function getSettings() {
  return chrome.storage.sync.get(DEFAULTS).then(function (s) {
    return Object.assign({}, DEFAULTS, s);
  });
}

function originPattern(url) {
  var u = new URL(url);
  return u.protocol + '//' + u.hostname + '/*';
}

/** 열린 본사 화면에서 표 읽기. content.js 가 아직 없으면(설치 전에 열어 둔 탭) 넣고 다시 묻습니다. */
function scrapeTab(tabId) {
  function ask() { return chrome.tabs.sendMessage(tabId, { type: 'GORAE_SCRAPE' }); }
  return ask().catch(function () {
    return chrome.scripting.executeScript({ target: { tabId: tabId, allFrames: true }, files: ['content.js'] })
      .then(ask);
  }).then(function (res) {
    if (!res) throw new Error('화면에서 대답이 없습니다. 페이지를 새로고침한 뒤 다시 눌러 주세요.');
    return res;
  });
}

function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color: color || '#2e7a57' });
  chrome.action.setBadgeText({ text: text });
  setTimeout(function () { chrome.action.setBadgeText({ text: '' }); }, 8000);
}

function remember(result) {
  result.at = new Date().toISOString();
  return chrome.storage.local.set({ lastResult: result }).then(function () { return result; });
}

/* ---------- ① 원생관리 화면으로 ---------- */
function sendToApp(payload, settings) {
  var base = String(settings.appUrl || DEFAULTS.appUrl).trim().split('#')[0];
  if (!/^https?:\/\//.test(base)) throw new Error('원생관리 주소가 올바르지 않습니다.');
  if (!/\/$/.test(base) && !/\.html?$/.test(base)) base += '/';
  var target = base + '#/grades?tab=records';
  var id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return chrome.storage.local.set({
    pendingGrades: { id: id, rows: payload.rows, pageUrl: payload.pageUrl, at: payload.scrapedAt }
  }).then(function () {
    return chrome.tabs.query({ url: originPattern(base) });
  }).catch(function () { return []; }).then(function (tabs) {
    var tab = (tabs || [])[0];
    if (!tab) {
      return chrome.tabs.create({ url: target, active: true }).then(function (created) {
        // staff.whalejinju.kr 은 bridge.js 가 저절로 들어가지만, 다른 주소로 바꿔 쓰는 경우를 위해 직접도 넣습니다.
        function onUpdated(id, info) {
          if (id !== created.id || info.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.scripting.executeScript({ target: { tabId: id }, files: ['bridge.js'] }).catch(function () {});
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    }
    return chrome.windows.update(tab.windowId, { focused: true })
      .then(function () { return chrome.tabs.update(tab.id, { active: true, url: target }); })
      .then(function () {
        // 화면이 이미 떠 있으면 다리(bridge.js)에 '지금 넘겨 달라' 고 부탁합니다.
        return chrome.tabs.sendMessage(tab.id, { type: 'GORAE_DELIVER' }).catch(function () {
          return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] }).catch(function () {});
        });
      });
  }).then(function () {
    return remember({ ok: true, mode: 'app', count: payload.rows.length,
      message: payload.rows.length + '건을 원생관리로 보냈습니다. 원생관리 창의 확인 창에서 [가져오기]를 눌러 주세요.' });
  });
}

/* ---------- ② 대시보드 API 로 POST ---------- */
function sendToApi(payload, settings) {
  var url = String(settings.apiUrl || '').trim();
  if (!/^https?:\/\//.test(url)) throw new Error('API 주소를 먼저 설정해 주세요.');
  var pattern = originPattern(url);
  return chrome.permissions.contains({ origins: [pattern] }).then(function (granted) {
    if (!granted) throw new Error('이 주소로 보낼 허락이 아직 없습니다. 팝업의 설정에서 [저장]을 한 번 눌러 허락해 주세요.');
    var headers = { 'Content-Type': 'application/json' };
    if (settings.apiToken) headers.Authorization = 'Bearer ' + settings.apiToken;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: ctrl.signal })
      .finally(function () { clearTimeout(timer); });
  }).then(function (res) {
    return res.text().then(function (text) {
      if (!res.ok) throw new Error('서버가 거절했습니다 (' + res.status + '). ' + text.slice(0, 160));
      badge(String(payload.rows.length));
      return remember({ ok: true, mode: 'api', count: payload.rows.length,
        message: payload.rows.length + '건을 API 로 보냈습니다. (응답 ' + res.status + ')' });
    });
  }, function (err) {
    if (err && err.name === 'AbortError') throw new Error('서버가 20초 동안 대답하지 않았습니다.');
    throw err;
  });
}

function sync(tabId) {
  return Promise.all([getSettings(), scrapeTab(tabId)]).then(function (got) {
    var settings = got[0], scraped = got[1];
    if (!scraped.ok || !scraped.rows.length) throw new Error(scraped.message || '보낼 성적이 없습니다.');
    var payload = {
      source: 'englishwhale.com',
      pageUrl: scraped.pageUrl,
      scrapedAt: new Date().toISOString(),
      count: scraped.rows.length,
      rows: scraped.rows
    };
    return settings.mode === 'api' ? sendToApi(payload, settings) : sendToApp(payload, settings);
  }).catch(function (err) {
    badge('!', '#a8453f');
    return remember({ ok: false, message: (err && err.message) || String(err) });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;
  if (msg.type === 'GORAE_PREVIEW') {
    scrapeTab(msg.tabId).then(sendResponse, function (err) {
      sendResponse({ ok: false, rows: [], message: (err && err.message) || String(err) });
    });
    return true;
  }
  if (msg.type === 'GORAE_SYNC') {
    sync(msg.tabId).then(sendResponse);
    return true;
  }
  if (msg.type === 'GORAE_DELIVERED') {
    badge(String(msg.count || '✓'));
    remember({ ok: true, mode: 'app', count: msg.count,
      message: '원생관리 화면이 ' + (msg.count || 0) + '건을 받았습니다. 확인 창에서 [가져오기]를 누르면 저장됩니다.' });
  }
  if (msg.type === 'GORAE_DELIVER_WAITING') {
    remember({ ok: false, mode: 'app',
      message: '원생관리 화면이 아직 받지 못했습니다. 로그인한 뒤 원생관리 화면을 새로고침하면 다시 넘겨 줍니다.' });
  }
});
