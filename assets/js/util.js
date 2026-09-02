/* ===== 공통 유틸 ===== */
var U = (function () {
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Date -> 'YYYY-MM-DD' (로컬 기준) */
  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /** Date -> 'YYYY-MM' */
  function ym(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  /** 'YYYY-MM-DD' -> Date (로컬 정오 기준, 타임존 밀림 방지) */
  function parseYmd(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
  }
  /** 'YYYY-MM-DD' -> '월' 같은 한글 요일 */
  function dayOf(s) { return DAYS[parseYmd(s).getDay()]; }
  /** 'YYYY-MM-DD' -> '2026년 8월 28일 (금)' */
  function human(s) {
    var d = parseYmd(s);
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DAYS[d.getDay()] + ')';
  }
  /** 'YYYY-MM-DD' -> '8/28(금)' */
  function shortDate(s) {
    var d = parseYmd(s);
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DAYS[d.getDay()] + ')';
  }
  /** ISO datetime -> 'HH:MM' */
  function hhmm(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /** 지금을 <input type="datetime-local"> 값으로 */
  function nowLocalInput() {
    var d = new Date();
    return ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /** 해당 달의 모든 날짜 문자열 배열 */
  function daysInMonth(monthStr) {
    var p = monthStr.split('-'), y = +p[0], m = +p[1];
    var last = new Date(y, m, 0).getDate(), out = [];
    for (var i = 1; i <= last; i++) out.push(y + '-' + pad(m) + '-' + pad(i));
    return out;
  }
  /** n일 전 날짜 문자열 */
  function daysAgo(n, from) {
    var d = from ? parseYmd(from) : new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** HTML 이스케이프 */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 퍼센트 (0나눗셈 안전) */
  function pct(num, den) {
    if (!den) return 0;
    return Math.round((num / den) * 1000) / 10;
  }

  /** 금액 -> '120,000원' */
  function won(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString('ko-KR') + '원';
  }
  /** 금액 -> '120,000' (단위 없음) */
  function num(n) {
    return (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
  }
  /** 'YYYY-MM' -> '2026년 9월' */
  function humanMonth(m) {
    var p = String(m || '').split('-');
    return p[0] + '년 ' + (+p[1]) + '월';
  }
  /** 두 날짜(YYYY-MM-DD) 사이의 일수 (b - a) */
  function dayDiff(a, b) {
    return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
  }

  /** 한국 전화번호 하이픈 */
  function phone(v) {
    var s = String(v || '').replace(/[^0-9]/g, '');
    if (!s) return '';
    if (s.length === 11) return s.slice(0, 3) + '-' + s.slice(3, 7) + '-' + s.slice(7);
    if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6);
    return v;
  }

  /** 이름 기준 한글 정렬 */
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); }

  /** UTF-8 안전 base64 (URL-safe) */
  function encodeData(obj) {
    var json = JSON.stringify(obj);
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeData(str) {
    try {
      var b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }

  /** 파일 다운로드 */
  function download(filename, text, mime) {
    var blob = new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  /** CSV 셀 이스케이프 */
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  /** 클립보드 복사 (구형 브라우저 폴백 포함) */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  return {
    DAYS: DAYS, pad: pad, ymd: ymd, ym: ym, parseYmd: parseYmd, dayOf: dayOf,
    human: human, shortDate: shortDate, hhmm: hhmm, nowLocalInput: nowLocalInput,
    daysInMonth: daysInMonth, daysAgo: daysAgo, uid: uid, esc: esc, pct: pct,
    won: won, num: num, humanMonth: humanMonth, dayDiff: dayDiff,
    phone: phone, byName: byName, encodeData: encodeData, decodeData: decodeData,
    download: download, toCsv: toCsv, copy: copy
  };
})();
