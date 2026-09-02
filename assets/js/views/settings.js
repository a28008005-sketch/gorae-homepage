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
      patrols: d.patrols.length,
      memos: d.memos.length,
      tasks: d.tasks.length,
      payments: d.payments.length
    };
  }

  /** 처음 사용해 보는 원장님을 위한 예시 데이터 */
  function seedSample() {
    var names = ['김서준', '이하은', '박도윤', '최지우', '정시우', '강예린', '윤하준', '임채원'];
    var grades = ['3학년', '4학년', '4학년', '5학년', '5학년', '6학년', '중1', '중2'];
    var dayset = [['월', '수', '금'], ['화', '목'], ['월', '수', '금'], ['화', '목'],
                  ['월', '수', '금'], ['화', '목'], ['월', '수', '금'], ['화', '목']];
    var times = ['3시', '4시', '3시', '5시', '4시', '5시', '6시', '6시'];

    var ids = names.map(function (n, i) {
      return Store.saveStudent({
        name: n, grade: grades[i], status: '등록생', seat: String(i + 1),
        days: dayset[i], time: times[i],
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
        Store.setAttendance(id, date, {
          status: status, flags: flags,
          planner: status === '출석' && Math.random() > 0.25,
          planDone: status === '출석' && Math.random() > 0.35,
          homework: status === '출석' && Math.random() > 0.3,
          note: ''
        });
      });
    }

    // 오늘 순회 점검 몇 건
    ids.slice(0, 4).forEach(function (id, i) {
      Store.savePatrol({
        studentId: id,
        at: new Date(Date.now() - i * 25 * 60000).toISOString(),
        states: [i === 1 ? Store.PATROL_STATES[1] : Store.PATROL_STATES[0]],
        action: i === 1 ? '잠깐 스트레칭 후 재집중 안내' : '',
        note: ''
      });
    });

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
              '<span class="tag blue">순회 ' + c.patrols + '</span>' +
              '<span class="tag blue">메모 ' + c.memos + '</span>' +
              '<span class="tag blue">업무 ' + c.tasks + '</span>' +
              '<span class="tag blue">수강료 ' + c.payments + '</span>' +
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
