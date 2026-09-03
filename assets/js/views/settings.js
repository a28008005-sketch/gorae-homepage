/* ===== 설정 · 백업 ===== */
window.Views = window.Views || {};
Views.settings = (function () {

  function title() { return '설정 · 백업'; }
  function sub() { return '학원 정보와 데이터 관리'; }

  function counts() {
    var d = Store.get();
    return {
      students: d.students.length,
      attendance: d.attendance.length,
      classes: d.classes.length,
      memos: d.memos.length,
      tasks: d.tasks.length,
      payments: d.payments.length,
      homeworks: d.homeworks.length,
      vocab: d.vocabLogs.length,
      books: d.books.length,
      loans: d.loans.length
    };
  }

  /** 처음 사용해 보는 원장님을 위한 예시 데이터 */
  function seedSample() {
    // 반 3개 — 학생은 반의 시간표를 따릅니다.
    var classDefs = [
      { name: '파닉스 A반', days: ['월', '수', '금'], time: '3시', teacher: '원장', capacity: 6 },
      { name: '초등 리딩반', days: ['화', '목'], time: '5시', teacher: '원장', capacity: 6 },
      { name: '중등 패턴반', days: ['월', '수', '금'], time: '6시', teacher: '원장', capacity: 5 }
    ];
    var classIds = classDefs.map(function (c) { return Store.saveClass(c); });

    var names = ['김서준', '이하은', '박도윤', '최지우', '정시우', '강예린', '윤하준', '임채원'];
    var grades = ['3학년', '4학년', '4학년', '5학년', '5학년', '6학년', '중1', '중2'];
    var belongs = [0, 1, 0, 1, 0, 1, 2, 2];   // 각 학생이 속한 반
    var dayset = belongs.map(function (b) { return classDefs[b].days; });

    var ids = names.map(function (n, i) {
      return Store.saveStudent({
        name: n, grade: grades[i], status: '등록생',
        classId: classIds[belongs[i]],
        days: [], time: '',
        phone: '', parentPhone: '010-0000-000' + i, parentEmail: '',
        fee: i >= 6 ? 280000 : '', billingDay: '',
        note: ''
      });
    });

    // 최근 3주치 출결을 요일에 맞춰 채웁니다.
    for (var back = 20; back >= 0; back--) {
      var date = U.daysAgo(back);
      var day = U.dayOf(date);
      ids.forEach(function (id, i) {
        if (dayset[i].indexOf(day) < 0) return;
        var roll = Math.random();
        var status = roll > 0.12 ? '출석' : '결석';
        var flags = (status === '출석' && Math.random() > 0.85) ? ['지각'] : [];
        // 수업 태도 — 대부분 집중, 가끔 주의 항목
        var attitude = [];
        if (status === '출석') {
          var r = Math.random();
          if (r > 0.88) attitude = [Store.ATTITUDES[1 + Math.floor(Math.random() * 4)]];
          else if (r > 0.35) attitude = [Store.ATTITUDES[0]];
        }
        Store.setAttendance(id, date, {
          status: status, flags: flags, attitude: attitude,
          attitudeNote: (attitude.length && Store.isIssue(attitude[0])) ? '자리 정돈 후 재집중 안내' : '',
          planner: status === '출석' && Math.random() > 0.25,
          planDone: status === '출석' && Math.random() > 0.35,
          homework: status === '출석' && Math.random() > 0.3,
          note: ''
        });
      });
    }

    // 이번 달 · 지난 달 수강료 청구서와 납부 기록
    [U.ym(U.parseYmd(U.daysAgo(35))), U.ym(new Date())].forEach(function (m, mi) {
      Store.generateBills(m);
      Store.payments({ month: m }).forEach(function (p, i) {
        // 지난 달은 모두 납부, 이번 달은 일부만 납부된 상태로 둡니다.
        var paid = mi === 0 ? true : (i % 3 !== 0);
        if (!paid) return;
        Store.savePayment({
          id: p.id,
          paidAmount: p.amount,
          paidDate: m + '-' + U.pad(Math.min(5 + i, 28)),
          method: i % 2 === 0 ? '계좌이체' : '현금'
        });
      });
    });

    // 숙제 2건 — 반 단위로 냅니다.
    Store.saveHomework({ title: 'Unit 3 단어 20개 외우기', type: '단어',
      classId: classIds[0], assignedDate: U.daysAgo(2), dueDate: U.daysAgo(-2),
      note: '단어학습앱으로 3회 이상 연습' });
    Store.saveHomework({ title: 'Frog and Toad 1~3장 읽고 북리포트', type: '원서 읽기',
      classId: classIds[1], assignedDate: U.daysAgo(4), dueDate: U.daysAgo(-1), note: '' });
    // 일부는 제출 처리
    Store.homeworks().forEach(function (h, hi) {
      Store.submissions({ homeworkId: h.id }).forEach(function (x, i) {
        if ((i + hi) % 3 !== 0) Store.setSubmission(h.id, x.studentId, { status: '제출', submittedAt: U.ymd() });
      });
    });

    // 학생 코드와 단어학습 기록 (앱에서 넘어온 것처럼)
    var sets = ['Unit 1 단어', 'Unit 2 단어', 'Unit 3 단어', '파닉스 복습'];
    ids.forEach(function (id, i) {
      Store.ensureCode(id);
      for (var back = 12; back >= 0; back -= 2) {
        if ((i + back) % 3 === 0) continue;
        var total = 20;
        var correct = Math.max(8, Math.round(total * (0.6 + Math.random() * 0.4)));
        Store.saveVocabLog({
          studentId: id, date: U.daysAgo(back),
          setName: sets[(i + back) % sets.length],
          total: total, correct: correct,
          durationSec: 180 + Math.floor(Math.random() * 240),
          sessionId: 'seed-' + id + '-' + back, source: 'app'
        });
      }
    });

    // 도서와 대여 기록
    // [청구기호, 제목, 지은이, 레벨, 분류, 시리즈, 핵심단어, 등장인물]
    var bookDefs = [
      ['RD-0412', 'Frog and Toad Are Friends', 'Arnold Lobel', 'AR 2.5', '리더스', 'Frog and Toad',
        'spring, letter, button, garden', 'Frog, Toad, Snail'],
      ['RD-0413', 'Frog and Toad Together', 'Arnold Lobel', 'AR 2.9', '리더스', 'Frog and Toad',
        'list, seeds, dragon, brave', 'Frog, Toad'],
      ['CB-0117', 'Magic Tree House #1', 'Mary Pope Osborne', 'AR 3.4', '챕터북', 'Magic Tree House',
        'dinosaur, medallion, valley', 'Jack, Annie'],
      ['CB-0118', 'Magic Tree House #2', 'Mary Pope Osborne', 'AR 3.3', '챕터북', 'Magic Tree House', '', 'Jack, Annie'],
      ['NB-0021', 'Charlotte\'s Web', 'E. B. White', 'AR 4.4', '노블', '', '', 'Wilbur, Charlotte, Fern, Templeton'],
      ['PB-0075', 'The Very Hungry Caterpillar', 'Eric Carle', 'AR 2.9', '그림책', '',
        'egg, leaf, cocoon, butterfly', ''],
      ['NF-0033', 'National Geographic Kids: Sharks', '', 'AR 4.1', '논픽션', '', '', ''],
      ['CB-0119', 'Nate the Great', 'Marjorie Sharmat', 'AR 2.0', '챕터북', 'Nate the Great', '', 'Nate, Sludge, Annie']
    ];
    var bookIds = bookDefs.map(function (b) {
      return Store.saveBook({
        code: b[0], title: b[1], author: b[2], level: b[3], category: b[4], series: b[5],
        wsWords: b[6], wsCharacters: b[7]
      });
    });
    // 3권은 대출 중, 그중 1권은 연체
    Store.lendBook(bookIds[0], ids[0], U.daysAgo(-4));
    Store.lendBook(bookIds[2], ids[3], U.daysAgo(-6));
    Store.lendBook(bookIds[4], ids[5], U.daysAgo(3));   // 반납 예정일이 지난 상태
    // 반납 완료된 지난 기록
    var past = Store.lendBook(bookIds[1], ids[1], U.daysAgo(-1));
    Store.returnBook(past, U.daysAgo(2));

    Store.addTask('9월 레벨테스트 예약 학부모 안내', 'today');
    Store.addTask('원서 신간 라이브러리 등록', 'week');
  }

  /** 클라우드 연결 카드 */
  function cloudBox() {
    var cfg = Sync.config();
    if (!Sync.isCloud()) {
      return '<p class="hint" style="margin-top:0">지금은 <b>이 기기에만 저장</b>하는 모드입니다. ' +
        '선생님들이 각자 기기에서 같은 명부와 출결을 보려면 클라우드를 연결하세요. ' +
        '연결해도 기록은 이 기기에 그대로 남고, 인터넷이 끊겨도 계속 입력할 수 있습니다.</p>' +
        '<div class="form-grid" style="margin-top:14px">' +
          '<label class="fld full">Supabase 프로젝트 URL' +
            '<input type="text" id="c-url" placeholder="https://xxxxxxxx.supabase.co"></label>' +
          '<label class="fld full">공개 키 (anon public key)' +
            '<textarea id="c-key" placeholder="eyJhbGciOi..." style="min-height:70px;font-size:12px"></textarea></label>' +
        '</div>' +
        '<div class="row" style="margin-top:12px">' +
          '<button class="btn primary" id="c-connect">클라우드 연결</button>' +
          '<a class="btn" href="docs/서버형-설치안내.md" target="_blank" rel="noopener">설치 안내 보기</a>' +
        '</div>' +
        '<p class="hint" style="margin-top:12px">⚠️ 여기에는 반드시 <b>anon public</b> 키만 넣으세요. ' +
        'service_role 키는 브라우저에 넣으면 안 됩니다.</p>';
    }
    var u = Sync.currentUser();
    return '<div class="row" style="gap:6px;margin-bottom:12px">' +
        '<span class="tag ok">클라우드 연결됨</span>' +
        (u ? '<span class="tag blue">' + U.esc(u.email || '') + '</span>' : '<span class="tag warn">로그아웃 상태</span>') +
        '<span class="tag gray">보낼 기록 ' + Sync.pendingCount() + '건</span>' +
      '</div>' +
      '<dl class="kv"><dt>서버</dt><dd style="word-break:break-all;font-size:12.5px">' + U.esc(cfg.url) + '</dd></dl>' +
      '<div class="section-title">이 기기의 기록 올리기</div>' +
      '<p class="hint" style="margin-top:0">이 기기에 있는 기록 전체를 클라우드로 올립니다. ' +
      '처음 옮길 때나 백업 파일을 불러온 직후에 한 번만 누르시면 됩니다.</p>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn primary" id="c-upload">전체 올리기</button>' +
        '<button class="btn" id="c-sync">지금 동기화</button>' +
        '<button class="btn danger" id="c-off">연결 해제</button>' +
      '</div>';
  }

  function bindCloud(el, rerenderBox) {
    var connect = el.querySelector('#c-connect');
    if (connect) {
      connect.addEventListener('click', function () {
        var url = el.querySelector('#c-url').value.trim();
        var key = el.querySelector('#c-key').value.trim();
        if (!/^https?:\/\//.test(url) || !key) {
          UI.toast('프로젝트 URL과 공개 키를 모두 입력해 주세요.', true); return;
        }
        if (/service_role/.test(key)) {
          UI.toast('service_role 키는 사용할 수 없습니다. anon public 키를 넣어 주세요.', true); return;
        }
        connect.disabled = true; connect.textContent = '연결 중…';
        Sync.enableCloud(url, key).then(function () {
          UI.toast('클라우드에 연결했습니다. 로그인해 주세요.');
          AuthUI.gate('연결되었습니다. 학원 계정으로 로그인해 주세요.');
          rerenderBox();
        }).catch(function (e) {
          Sync.disableCloud();
          UI.toast(e.message || '연결에 실패했습니다.', true);
          rerenderBox();
        });
      });
    }

    var upload = el.querySelector('#c-upload');
    if (upload) {
      upload.addEventListener('click', function () {
        UI.confirm('이 기기의 기록 전체를 클라우드로 올릴까요?<br>' +
          '<span style="font-size:13px;color:#63778a">같은 기록이 클라우드에 이미 있다면 이 기기의 내용으로 덮어씁니다.</span>',
          function () {
            upload.disabled = true; upload.textContent = '올리는 중…';
            Sync.uploadAll().then(function (n) {
              UI.toast(n + '건을 올렸습니다.');
              rerenderBox();
            }).catch(function (e) {
              UI.toast(e.message || '업로드에 실패했습니다.', true);
              rerenderBox();
            });
          }, { yes: '올리기' });
      });
    }

    var sync = el.querySelector('#c-sync');
    if (sync) sync.addEventListener('click', function () {
      sync.disabled = true; sync.textContent = '동기화 중…';
      Sync.syncNow().then(function () { UI.toast('동기화했습니다.'); App.rerender(); });
    });

    var off = el.querySelector('#c-off');
    if (off) off.addEventListener('click', function () {
      UI.confirm('클라우드 연결을 해제할까요?<br>' +
        '<span style="font-size:13px;color:#63778a">이 기기의 기록은 그대로 남고, 이후 변경은 다른 선생님께 전달되지 않습니다.</span>',
        function () {
          Sync.disableCloud();
          UI.toast('연결을 해제했습니다.');
          rerenderBox();
        }, { danger: true, yes: '해제' });
    });
  }

  function render(el) {
    var ac = Store.get().academy;
    var c = counts();

    el.innerHTML =
      '<div class="grid g-2">' +

        '<div class="card"><div class="card-h"><h2>학원 정보</h2></div><div class="card-b">' +
          '<div class="form-grid">' +
            '<label class="fld">학원명<input type="text" id="a-name" value="' + U.esc(ac.name) + '"></label>' +
            '<label class="fld">캠퍼스<input type="text" id="a-campus" value="' + U.esc(ac.campus) + '"></label>' +
            '<label class="fld full">영문 학원명 <span style="font-weight:400">(워크시트 등 영어 인쇄물에 들어갑니다)</span>' +
              '<input type="text" id="a-enname" value="' + U.esc(ac.enName || '') + '" placeholder="GORAE ENGLISH"></label>' +
            '<label class="fld full">주소<input type="text" id="a-addr" value="' + U.esc(ac.address) + '"></label>' +
            '<label class="fld">대표 연락처<input type="tel" id="a-phone" value="' + U.esc(ac.phone) + '"></label>' +
            '<label class="fld">홈페이지<input type="text" id="a-site" value="' + U.esc(ac.site) + '"></label>' +
            '<label class="fld full">수업 시간대 <span style="font-weight:400">(쉼표로 구분)</span>' +
              '<input type="text" id="a-times" value="' + U.esc(ac.times.join(', ')) + '"></label>' +
          '</div>' +

          '<div class="section-title">수강료 기본 설정</div>' +
          '<div class="form-grid">' +
            '<label class="fld">기본 월 수강료<input type="number" id="a-fee" step="1000" value="' + (ac.defaultFee || 0) + '"></label>' +
            '<label class="fld">기본 납부일 <span style="font-weight:400">(매월)</span>' +
              '<input type="number" id="a-bday" min="1" max="31" value="' + (ac.billingDay || 10) + '"></label>' +
            '<label class="fld">입금 은행<input type="text" id="a-bank" value="' + U.esc(ac.bankName || '') + '" placeholder="농협"></label>' +
            '<label class="fld">예금주<input type="text" id="a-holder" value="' + U.esc(ac.bankHolder || '') + '" placeholder="홍길동"></label>' +
            '<label class="fld full">계좌번호<input type="text" id="a-acct" value="' + U.esc(ac.bankAccount || '') + '" placeholder="123-4567-8910-11"></label>' +
          '</div>' +
          '<p class="hint" style="margin:10px 0 0">계좌 정보는 미납 안내 문자에 자동으로 들어갑니다. 학생별 수강료가 비어 있으면 기본 수강료로 청구됩니다.</p>' +

          '<button class="btn primary" id="a-save" style="margin-top:14px">학원 정보 저장</button>' +
        '</div></div>' +

        '<div class="stack">' +
          '<div class="card"><div class="card-h"><h2>데이터 백업</h2></div><div class="card-b">' +
            '<p class="hint" style="margin-top:0">' + (Sync.isCloud()
              ? '기록은 <b>이 기기와 클라우드 양쪽에</b> 저장됩니다. 기기 한 대가 고장 나도 기록은 남지만, ' +
                '학기마다 한 번씩 백업 파일을 받아 두시면 더 안전합니다.'
              : '모든 기록은 <b>이 브라우저 안에만</b> 저장됩니다. ' +
                '컴퓨터를 바꾸거나 브라우저 데이터를 지우면 사라지므로, 주기적으로 백업 파일을 내려받아 두세요.') + '</p>' +
            '<div class="row" style="margin-top:14px">' +
              '<button class="btn primary" id="b-export">백업 파일 내보내기</button>' +
              '<button class="btn" id="b-import">백업 파일 불러오기</button>' +
              '<input type="file" id="b-file" accept="application/json,.json" style="display:none">' +
            '</div>' +
            '<div class="section-title">현재 저장된 기록</div>' +
            '<div class="row" style="gap:6px">' +
              '<span class="tag blue">학생 ' + c.students + '</span>' +
              '<span class="tag blue">출결 ' + c.attendance + '</span>' +
              '<span class="tag blue">반 ' + c.classes + '</span>' +
              '<span class="tag blue">메모 ' + c.memos + '</span>' +
              '<span class="tag blue">업무 ' + c.tasks + '</span>' +
              '<span class="tag blue">수강료 ' + c.payments + '</span>' +
              '<span class="tag blue">숙제 ' + c.homeworks + '</span>' +
              '<span class="tag blue">단어 ' + c.vocab + '</span>' +
              '<span class="tag blue">도서 ' + c.books + '</span>' +
              '<span class="tag blue">대여 ' + c.loans + '</span>' +
            '</div>' +
          '</div></div>' +

          '<div class="card"><div class="card-h"><h2>여러 기기에서 함께 쓰기</h2></div><div class="card-b" id="cloud-box">' +
            cloudBox() +
          '</div></div>' +

          '<div class="card"><div class="card-h"><h2>초기 설정 도우미</h2></div><div class="card-b">' +
            '<p class="hint" style="margin-top:0">기능을 먼저 둘러보고 싶다면 예시 학생 8명과 3주치 출결 기록을 넣어볼 수 있습니다.</p>' +
            '<div class="row" style="margin-top:12px">' +
              '<button class="btn mint" id="b-sample">예시 데이터 넣기</button>' +
              '<button class="btn danger" id="b-reset">전체 초기화</button>' +
            '</div>' +
          '</div></div>' +
        '</div>' +

      '</div>';

    bindCloud(el, function () { render(el); });

    el.querySelector('#a-save').addEventListener('click', function () {
      var times = el.querySelector('#a-times').value.split(',')
        .map(function (t) { return t.trim(); }).filter(Boolean);
      Store.saveAcademy({
        name: el.querySelector('#a-name').value.trim() || '고래영어',
        campus: el.querySelector('#a-campus').value.trim(),
        enName: el.querySelector('#a-enname').value.trim() || 'GORAE ENGLISH',
        address: el.querySelector('#a-addr').value.trim(),
        phone: el.querySelector('#a-phone').value.trim(),
        site: el.querySelector('#a-site').value.trim(),
        times: times.length ? times : ['1시', '2시', '3시', '4시'],
        defaultFee: Number(el.querySelector('#a-fee').value) || 0,
        billingDay: Math.min(Math.max(Number(el.querySelector('#a-bday').value) || 10, 1), 31),
        bankName: el.querySelector('#a-bank').value.trim(),
        bankHolder: el.querySelector('#a-holder').value.trim(),
        bankAccount: el.querySelector('#a-acct').value.trim()
      });
      UI.toast('학원 정보를 저장했습니다.');
      App.refreshBrand();
    });

    el.querySelector('#b-export').addEventListener('click', function () {
      U.download('고래영어_원생관리_백업_' + U.ymd() + '.json', Store.exportJson(), 'application/json');
      UI.toast('백업 파일을 내려받았습니다.');
    });

    el.querySelector('#b-import').addEventListener('click', function () {
      el.querySelector('#b-file').click();
    });
    el.querySelector('#b-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        UI.confirm('백업 파일을 불러오면 <b>현재 기록을 모두 덮어씁니다.</b><br>계속할까요?', function () {
          try {
            Store.importJson(reader.result);
            UI.toast('백업을 복원했습니다.');
            App.refreshBrand();
            render(el);
          } catch (err) {
            UI.toast(err.message || '파일을 읽을 수 없습니다.', true);
          }
        }, { danger: true, yes: '덮어쓰기' });
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    el.querySelector('#b-sample').addEventListener('click', function () {
      UI.confirm('예시 학생 8명과 최근 3주치 출결 기록을 추가할까요?<br>' +
        '<span style="font-size:13px;color:#63778a">기존 기록은 지워지지 않고 함께 남습니다.</span>', function () {
        seedSample();
        UI.toast('예시 데이터를 넣었습니다.');
        render(el);
      }, { yes: '넣기' });
    });

    el.querySelector('#b-reset').addEventListener('click', function () {
      UI.confirm('저장된 <b>모든 기록이 삭제</b>됩니다. 되돌릴 수 없습니다.<br>' +
        '<span style="font-size:13px;color:#63778a">먼저 백업 파일을 내려받아 두시길 권합니다.</span>', function () {
        Store.resetAll();
        UI.toast('초기화했습니다.');
        App.refreshBrand();
        render(el);
      }, { danger: true, yes: '전체 삭제' });
    });
  }

  return { title: title, sub: sub, render: render, seedSample: seedSample };
})();
