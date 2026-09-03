/* ===== 단어학습앱 데이터 받기 =====
 * 앱이 어떤 방식으로 만들어졌든 아래 형식만 맞추면 기록이 쌓입니다.
 *  1) JSON 파일 · 붙여넣기
 *  2) CSV 파일 · 붙여넣기
 *  3) 링크 열기  #/import?d=<base64 JSON>
 */
var VocabImport = (function () {

  /** CSV 열 이름 → 내부 이름 (한글·영문 모두 받습니다) */
  var COLS = {
    '학생코드': 'studentCode', 'code': 'studentCode', 'studentcode': 'studentCode',
    '학생이름': 'studentName', '이름': 'studentName', 'name': 'studentName', 'student': 'studentName',
    '날짜': 'date', 'date': 'date',
    '단어장': 'setName', '범위': 'setName', 'set': 'setName', 'setname': 'setName', 'unit': 'setName',
    '총문항': 'total', '문항수': 'total', 'total': 'total', 'count': 'total',
    '정답': 'correct', '정답수': 'correct', 'correct': 'correct', 'score': 'correct',
    '학습시간': 'durationSec', '시간': 'durationSec', 'duration': 'durationSec', 'durationsec': 'durationSec',
    '세션id': 'sessionId', '세션': 'sessionId', 'sessionid': 'sessionId', 'id': 'sessionId'
  };

  function splitCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (v) { return v.trim(); });
  }

  function parseCsv(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
    var head = splitCsvLine(lines[0]).map(function (h) {
      return COLS[h.toLowerCase().replace(/\s|\(.*\)/g, '')] || COLS[h] || h;
    });
    return lines.slice(1).map(function (line) {
      var cells = splitCsvLine(line), row = {};
      head.forEach(function (h, i) { row[h] = cells[i]; });
      return row;
    });
  }

  /** 텍스트(JSON 또는 CSV)를 학습 기록 배열로 */
  function parse(text) {
    text = String(text || '').trim();
    if (!text) return { sessions: [], error: '내용이 비어 있습니다.' };
    if (text[0] === '{' || text[0] === '[') {
      try {
        var j = JSON.parse(text);
        var arr = Array.isArray(j) ? j : (j.sessions || j.logs || j.data || []);
        if (!Array.isArray(arr)) return { sessions: [], error: 'sessions 목록을 찾지 못했습니다.' };
        return { sessions: arr };
      } catch (e) {
        return { sessions: [], error: 'JSON 형식이 올바르지 않습니다.' };
      }
    }
    var rows = parseCsv(text);
    if (!rows.length) return { sessions: [], error: 'CSV에서 읽을 줄이 없습니다. 첫 줄은 열 이름이어야 합니다.' };
    return { sessions: rows };
  }

  /** 학생을 찾아 붙이고, 못 찾은 줄은 따로 모읍니다. */
  function resolve(sessions) {
    var ready = [], unknown = [];
    (sessions || []).forEach(function (row, i) {
      var ref = row.studentCode || row.studentName || row.student || '';
      var stu = Store.findStudent(ref);
      var total = Number(row.total);
      var correct = Number(row.correct);
      var log = {
        studentId: stu ? stu.id : '',
        date: String(row.date || U.ymd()).slice(0, 10),
        setName: String(row.setName || '단어 학습'),
        total: isNaN(total) ? 0 : total,
        correct: isNaN(correct) ? 0 : correct,
        durationSec: Number(row.durationSec) || 0,
        sessionId: row.sessionId ? String(row.sessionId) : '',
        source: 'app'
      };
      if (!stu) unknown.push({ row: i + 1, ref: String(ref || '(비어 있음)'), log: log });
      else ready.push({ log: log, student: stu });
    });
    return { ready: ready, unknown: unknown };
  }

  /** 실제로 저장. 세션 아이디가 같은 기록은 덮어씁니다. */
  function apply(ready) {
    var added = 0;
    ready.forEach(function (r) {
      Store.saveVocabLog(r.log);
      added++;
    });
    return added;
  }

  /** 미리보기 표 */
  function previewHtml(res) {
    var rows = res.ready.slice(0, 12).map(function (r) {
      return '<tr><td class="nm">' + U.esc(r.student.name) + '</td>' +
        '<td>' + U.esc(r.log.date) + '</td>' +
        '<td>' + U.esc(r.log.setName) + '</td>' +
        '<td class="num">' + r.log.correct + ' / ' + r.log.total + '</td>' +
        '<td class="num">' + (r.log.total ? U.pct(r.log.correct, r.log.total) : 0) + '%</td></tr>';
    }).join('');

    return (res.ready.length
        ? '<div class="table-wrap"><table class="tbl" style="min-width:auto">' +
          '<thead><tr><th>학생</th><th>날짜</th><th>단어장</th><th class="num">정답</th><th class="num">정답률</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
          (res.ready.length > 12 ? '<div class="hint" style="margin-top:6px">외 ' + (res.ready.length - 12) + '건</div>' : '')
        : UI.emptyBox('가져올 기록이 없습니다.', '📥')) +
      (res.unknown.length
        ? '<div class="section-title">학생을 찾지 못한 줄 (' + res.unknown.length + '건)</div>' +
          '<p class="hint" style="margin-top:0">아래 값과 일치하는 학생 코드나 이름이 명부에 없습니다. ' +
          '이 줄은 가져오지 않습니다. 학생 코드는 <b>단어 학습</b> 화면에서 확인하실 수 있습니다.</p>' +
          '<div class="chips" style="margin-top:8px">' +
            res.unknown.slice(0, 20).map(function (u) {
              return '<span class="chip static">' + u.row + '행 · ' + U.esc(u.ref) + '</span>';
            }).join('') + '</div>'
        : '');
  }

  return { parse: parse, resolve: resolve, apply: apply, previewHtml: previewHtml };
})();
