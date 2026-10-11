/* ==========================================================================
   場景單字輸入練習 — 核心引擎
   --------------------------------------------------------------------------
   練習流程照 wordmomo 的架構：中文出題 → 逐字打字 → 錯三次浮水印 + 自動朗讀
     → 完成後 Space 進下一個單元、Enter 重打。
   這裡的差異是「單元」變成「場景」，每個場景底下再分 1–6 級，
   同一個單元內則是 單字 → 詞組 → 整句 的循序漸進。
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.BANKS || { scenarios: [], totalEntries: 0 };
  var STORE_PROGRESS = 'scen.progress.v1';
  var STORE_MISTAKES = 'scen.mistakes.v1';
  var STORE_SETTINGS = 'scen.settings.v1';

  var KIND_LABEL = { word: '單字', phrase: '詞組', sentence: '整句' };
  var KIND_CLASS = { word: 'badge--w', phrase: 'badge--p', sentence: 'badge--s' };
  var LEVELS = [1, 2, 3, 4, 5, 6];

  /* ------------------------------------------------------------ 狀態 */
  var state = {
    view: 'home',
    levelFilter: 0,            // 0 = 全部
    scenarioId: null,
    unitIndex: 0,
    stepIndex: 0,
    progress: {},              // sid -> { done:{unitId:[stepIdx]}, cur:{unit,step}, words:{key:[idx]} }
    mistakes: {},              // wordKey -> {en,zh,n,sid,unitId}
    settings: { hideZh: false, autoNext: true, autoSpeak: true, repeat: 3, rate: 0.85 }
  };

  var voice = null;
  var errCount = [];           // 目前這一步每個字的錯誤次數
  var hintOn = [];             // 是否已顯示浮水印
  var wordEls = [];

  /* ------------------------------------------------------------ 小工具 */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function readStore(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : v; }
    catch (e) { return fb; }
  }
  function writeStore(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function scenarioById(id) {
    for (var i = 0; i < DATA.scenarios.length; i++)
      if (DATA.scenarios[i].id === id) return DATA.scenarios[i];
    return null;
  }
  function progressOf(sid) {
    if (!state.progress[sid]) state.progress[sid] = { done: {}, cur: { unit: 0, step: 0 }, words: {} };
    return state.progress[sid];
  }
  function saveAll() {
    writeStore(STORE_PROGRESS, JSON.stringify(state.progress));
    writeStore(STORE_MISTAKES, JSON.stringify(state.mistakes));
    writeStore(STORE_SETTINGS, JSON.stringify(state.settings));
    updateBadges();
  }

  /* ------------------------------------------------------------ 語音 */
  function initVoices() {
    if (!('speechSynthesis' in window)) return;
    var voices = speechSynthesis.getVoices() || [];
    var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
    en.sort(function (a, b) {
      function score(v) {
        return (v.name.indexOf('Google') >= 0 ? 2 : 0)
             + (v.name.indexOf('Microsoft') >= 0 ? 1 : 0)
             + (v.name.indexOf('Samantha') >= 0 ? 1 : 0);
      }
      return score(b) - score(a);
    });
    var sel = $('voiceSelect');
    sel.innerHTML = '';
    if (!en.length) {
      var o = document.createElement('option');
      o.textContent = '（此裝置沒有英文語音）';
      sel.appendChild(o);
      return;
    }
    en.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.name;
      o.textContent = v.name + ' (' + v.lang + ')';
      sel.appendChild(o);
    });
    voice = en[0];
    sel.addEventListener('change', function () {
      en.forEach(function (v) { if (v.name === sel.value) voice = v; });
    });
  }

  function speak(text, times) {
    if (!('speechSynthesis' in window) || !text) return;
    // 先 canon 成半形：語音合成引擎對 ASCII 撇號的處理最穩
    var clean = canon(text).replace(/[^A-Za-z0-9\s'\-]/g, ' ').trim();
    if (!clean) return;
    // 語速由上方選單控制，存進 localStorage；預設 0.85（稍慢，適合跟著唸）
    var rate = parseFloat(state.settings.rate);
    if (!isFinite(rate) || rate <= 0) rate = 0.85;
    speechSynthesis.cancel();
    for (var i = 0; i < (times || 1); i++) {
      var u = new SpeechSynthesisUtterance(clean);
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      speechSynthesis.speak(u);
    }
  }

  /* ------------------------------------------------------------ 首頁 */
  function unitsOf(sc) {
    if (!state.levelFilter) return sc.units;
    return sc.units.filter(function (u) { return u.level === state.levelFilter; });
  }

  function renderHome() {
    // 等級篩選
    var chips = $('levelChips');
    chips.innerHTML = '';
    LEVELS.forEach(function (lv) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.levelFilter === lv ? ' on' : '');
      b.textContent = lv + ' 級';
      b.onclick = function () { state.levelFilter = lv; renderHome(); };
      chips.appendChild(b);
    });
    $('resetFilter').onclick = function () { state.levelFilter = 0; renderHome(); };

    // 總進度
    var totUnits = 0, totDone = 0, totalSteps = 0, doneSteps = 0;
    DATA.scenarios.forEach(function (sc) {
      var us = unitsOf(sc);
      var p = state.progress[sc.id] || { done: {} };
      totUnits += us.length;
      us.forEach(function (u) {
        var arr = p.done[u.id] || [];
        if (arr.length) totDone++;
        u.steps.forEach(function (_, i) {
          totalSteps++;
          if (arr.indexOf(i) >= 0) doneSteps++;
        });
      });
    });
    var pct = totalSteps ? Math.round(doneSteps / totalSteps * 100) : 0;
    $('ringOverall').style.setProperty('--p', pct);
    $('ringPct').textContent = pct + '%';
    $('statDone').textContent = totDone;
    $('statTotal').textContent = totUnits;

    // 場景卡片
    var grid = $('scenarioGrid');
    grid.innerHTML = '';
    DATA.scenarios.forEach(function (sc) {
      var us = unitsOf(sc);
      var p = state.progress[sc.id] || { done: {} };
      var st = 0, ts = 0;
      us.forEach(function (u) {
        st += (p.done[u.id] || []).length;
        u.steps.forEach(function () { ts++; });
      });
      var cardPct = ts ? Math.round(st / ts * 100) : 0;

      var lvDots = '';
      LEVELS.forEach(function (lv) {
        var has = sc.units.some(function (u) { return u.level === lv; });
        lvDots += '<i class="lvDot' + (has ? ' has' : '') + '"></i>';
      });

      var el = document.createElement('button');
      el.className = 'card';
      el.innerHTML =
        '<div class="card__top"><span class="card__icon">' + esc(sc.icon) + '</span>' +
        '<span class="card__title">' + esc(sc.title) + '</span></div>' +
        '<div class="card__desc">' + esc(sc.desc) + '</div>' +
        '<div class="card__foot"><span class="card__lv">' + lvDots + '</span>' +
        '<span class="card__pct">' + us.length + ' 單元 · ' + cardPct + '%</span></div>' +
        '<div class="card__bar"><i style="width:' + cardPct + '%"></i></div>';
      el.onclick = function () { openScenario(sc.id); };
      grid.appendChild(el);
    });
  }

  /* ------------------------------------------------------------ 練習 */
  function curScenario() { return scenarioById(state.scenarioId); }
  function curUnits() { return curScenario() ? unitsOf(curScenario()) : []; }
  function curUnit() { return curUnits()[state.unitIndex]; }
  function curStep() {
    var u = curUnit();
    return u ? u.steps[state.stepIndex] : null;
  }

  function openScenario(sid) {
    state.scenarioId = sid;
    var us = curUnits();
    if (!us.length) { toast('這個等級在這個場景沒有單元'); return; }
    var p = progressOf(sid);
    state.unitIndex = Math.min(p.cur.unit || 0, us.length - 1);
    state.stepIndex = Math.min(p.cur.step || 0, us[state.unitIndex].steps.length - 1);
    showView('practice');
    renderPractice();
  }

  var VIEW_IDS = {
    home: 'viewHome', practice: 'viewPractice', browse: 'viewBrowse',
    mistakes: 'viewMistakes', stats: 'viewStats', data: 'viewData'
  };
  function showView(v) {
    state.view = v;
    Object.keys(VIEW_IDS).forEach(function (key) {
      $(VIEW_IDS[key]).hidden = (key !== v);
    });
  }

  function renderPractice() {
    var sc = curScenario(), u = curUnit(), s = curStep();
    if (!sc || !u || !s) { showView('home'); renderHome(); return; }

    $('pIcon').textContent = sc.icon;
    $('pTitle').textContent = sc.title;
    $('pUnit').textContent = '單元 ' + (state.unitIndex + 1) + ' / ' + curUnits().length;
    $('pLevel').textContent = u.level + ' 級';

    // 步驟條
    var bar = $('stepBar');
    bar.innerHTML = '';
    var done = (progressOf(sc.id).done[u.id] || []);
    u.steps.forEach(function (st, i) {
      var li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + KIND_LABEL[st.kind];
      if (i === state.stepIndex) li.className = 'on';
      else if (done.indexOf(i) >= 0) li.className = 'done';
      li.onclick = function () { state.stepIndex = i; renderPractice(); };
      bar.appendChild(li);
    });

    // 題目
    var zb = $('kindBadge');
    zb.textContent = KIND_LABEL[s.kind];
    zb.className = 'badge ' + KIND_CLASS[s.kind];
    $('srcBadge').textContent = srcLabel(s);

    var zhEl = $('promptZh');
    zhEl.textContent = s.zh || '（這一步沒有中文提示）';
    zhEl.classList.toggle('hidden-hint', state.settings.hideZh);

    // 音標：整句有音標就顯示整句的，否則退回目標單字的
    $('promptIpa').textContent = s.ipa ? '/' + s.ipa + '/' : (u.ipa ? '/' + u.ipa + '/' : '');
    $('promptEn').hidden = true;
    $('promptTip').textContent = u.target + ' — ' + u.gloss;

    renderWords();
    updateBanner();
    syncHash();
    speak(s.en, 1);
  }

  // 讓網址跟著目前的場景／單元／步驟走，方便重新整理與分享
  // 用 replaceState 才不會觸發 hashchange 造成重複渲染
  function syncHash() {
    if (!state.scenarioId) return;
    var h = '#' + state.scenarioId + '/' + state.unitIndex + '/' + state.stepIndex;
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); }
      catch (e) { /* file:// 下 replaceState 可能失敗，忽略即可 */ }
    }
  }

  function renderWords() {
    var s = curStep();
    var box = $('words');
    box.innerHTML = '';
    wordEls = [];
    errCount = [];
    hintOn = [];

    var toks = String(s.en).match(/([A-Za-z0-9'’]+)|([^A-Za-z0-9'\s]+)/g) || [];
    var i = 0;

    toks.forEach(function (tok) {
      if (/[A-Za-z0-9'’]/.test(tok)) {
        var idx = i;
        errCount[idx] = 0;
        hintOn[idx] = false;

        var wrap = document.createElement('div');
        wrap.className = 'word';

        var slot = document.createElement('div');
        slot.className = 'slot';
        // 等寬字：1ch 就是一個字寬，再加上左右留白
        slot.style.width = 'calc(' + Math.max(tok.length, 1) + 'ch + 1.2em)';

        var wm = document.createElement('div');
        wm.className = 'wm';

        var inp = document.createElement('input');
        inp.type = 'text';
        inp.autocomplete = 'off'; inp.autocapitalize = 'off';
        inp.spellcheck = false;
        inp.dataset.target = tok;
        inp.setAttribute('aria-label', '第 ' + (idx + 1) + ' 個字');

        slot.appendChild(wm); slot.appendChild(inp);
        wrap.appendChild(slot);
        box.appendChild(wrap);

        inp.addEventListener('focus', function () { slot.classList.add('focus'); });
        inp.addEventListener('blur',  function () { slot.classList.remove('focus'); });
        inp.addEventListener('input',  function () { onInput(inp, slot, wm, tok, idx); });
        inp.addEventListener('keydown', function (e) { onKey(e, inp, tok); });

        wordEls.push({ input: inp, slot: slot, wm: wm, target: tok });
        i++;
      } else if (tok.trim()) {
        var p = document.createElement('span');
        p.className = 'punct';
        p.textContent = tok;
        box.appendChild(p);
      }
    });

    restoreWords();
    // 焦點停在第一個還沒打好的字（整句都打過時停在最後一個）
    setTimeout(function () {
      var next = null;
      for (var k = 0; k < wordEls.length; k++) {
        if (!wordEls[k].input.classList.contains('ok')) { next = k; break; }
      }
      focusIndexOf(next === null ? wordEls.length - 1 : next);
    }, 40);
  }

  function focusIndexOf(k) {
    if (wordEls[k]) wordEls[k].input.focus();
  }

  function wordKey() {
    var u = curUnit();
    return state.scenarioId + '|' + u.id + '|' + state.stepIndex;
  }

  function restoreWords() {
    var saved = progressOf(state.scenarioId).words[wordKey()] || [];
    saved.forEach(function (k) {
      var w = wordEls[k];
      if (!w) return;
      w.input.value = canon(w.target);   // 存檔的是「打對過」，顯示成打得出來的那一種
      w.input.classList.add('ok');
      w.slot.classList.add('ok');
    });
  }

  // 鍵盤打得出來的是 U+0027（'），但 PDF、Word、瀏覽器自動排版常給 U+2019（’）。
  // 兩種都視為同一個字，學生用哪一種都算對；輸入框永遠顯示「打得出來」那一種。
  function canon(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—−]/g, '-');
  }

  function updateWatermark(w, typed) {
    var t = canon(typed).toLowerCase();
    var full = canon(w.target);
    var low = full.toLowerCase();
    if (t === low) { w.wm.innerHTML = ''; return; }
    w.wm.innerHTML = t.length > 0 && low.indexOf(t) === 0
      ? '<span class="t">' + esc(full.slice(0, t.length)) + '</span><span class="r">' +
        esc(full.slice(t.length)) + '</span>'
      : '<span class="r">' + esc(full) + '</span>';
  }

  function onInput(inp, slot, wm, target, idx) {
    var v = inp.value;
    var full = canon(target);
    var lv = canon(v).toLowerCase();
    var lfull = full.toLowerCase();
    var okPrefix = lfull.indexOf(lv) === 0;

    if (!okPrefix) {
      slot.classList.add('bad'); slot.classList.remove('ok');
      inp.classList.add('bad'); inp.classList.remove('ok');
      errCount[idx]++;
      bumpMistake(target);
      if (errCount[idx] >= 3 && !hintOn[idx]) {
        hintOn[idx] = true;
        updateWatermark(wordEls[idx], v);
        if (state.settings.autoSpeak) speak(target, parseInt(state.settings.repeat, 10) || 3);
      }
      return;
    }

    slot.classList.remove('bad'); inp.classList.remove('bad');
    if (hintOn[idx]) updateWatermark(wordEls[idx], v);

    if (lv === lfull) {
      // 填回「打得出的那一種」，不要因為題庫是 ’ 就叫學生打不出來的字
      inp.value = full;
      wm.innerHTML = '';
      inp.classList.add('ok'); slot.classList.add('ok');
      slot.classList.remove('focus');
      persistWords();
      if (state.settings.autoNext) {
        var nx = wordEls[idx + 1];
        if (nx) nx.input.focus();
      }
      updateBanner();
    }
  }

  function onKey(e, inp, target) {
    if (e.key === ' ') {
      e.preventDefault();
      if (isDone()) nextStep();
      else speak(target, 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      retryStep();
      return;
    }
    if (inp.classList.contains('bad') &&
        e.key !== 'Backspace' && e.key !== 'Delete' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
    }
  }

  function isDone() {
    return wordEls.length > 0 && wordEls.every(function (w) {
      return canon(w.input.value).toLowerCase() === canon(w.target).toLowerCase();
    });
  }

  function updateBanner() { $('banner').hidden = !isDone(); }

  function persistWords() {
    var p = progressOf(state.scenarioId);
    var list = wordEls.map(function (w, i) {
      return w.input.value.toLowerCase() === w.target.toLowerCase() ? i : -1;
    }).filter(function (i) { return i >= 0; });
    p.words[wordKey()] = list;
    saveAll();
  }

  function markStepDone() {
    var u = curUnit(), sc = curScenario();
    var p = progressOf(sc.id);
    if (!p.done[u.id]) p.done[u.id] = [];
    if (p.done[u.id].indexOf(state.stepIndex) < 0) p.done[u.id].push(state.stepIndex);
    p.cur = { unit: state.unitIndex, step: state.stepIndex };
    saveAll();
  }

  function nextStep() {
    markStepDone();
    var u = curUnit();
    if (state.stepIndex < u.steps.length - 1) {
      state.stepIndex++;
    } else {
      var us = curUnits();
      if (state.unitIndex < us.length - 1) {
        state.unitIndex++; state.stepIndex = 0;
        progressOf(state.scenarioId).cur = { unit: state.unitIndex, step: 0 };
      } else {
        toast('🎉 這個場景練完啦！');
        showView('home'); renderHome(); return;
      }
    }
    saveAll();
    renderPractice();
  }

  function retryStep() {
    wordEls.forEach(function (w) { w.input.value = ''; w.wm.innerHTML = ''; });
    errCount = wordEls.map(function () { return 0; });
    hintOn = wordEls.map(function () { return false; });
    wordEls.forEach(function (w) {
      w.slot.classList.remove('ok', 'bad');
      w.input.classList.remove('ok', 'bad');
    });
    updateBanner();
    var p = progressOf(state.scenarioId);
    delete p.words[wordKey()];
    saveAll();
    if (wordEls[0]) wordEls[0].input.focus();
  }

  function gotoUnit(delta) {
    var us = curUnits();
    var i = state.unitIndex + delta;
    if (i < 0 || i >= us.length) return;
    state.unitIndex = i;
    state.stepIndex = 0;
    progressOf(state.scenarioId).cur = { unit: i, step: 0 };
    saveAll();
    renderPractice();
  }

  function peek() {
    var box = $('promptEn');
    if (!box.hidden) { box.hidden = true; return; }
    var s = curStep();
    box.textContent = s.en;
    box.hidden = false;
  }

  /* ------------------------------------------------------------ 錯字本 */
  /* ------------------------------------------------------------ 單字索引
     錯字本需要顯示「打錯的那個字」自己的中文釋義與音標。
     單元是照目標單字排的，所以不能用單元的 gloss 代替——
     否則在「午餐」單元裡打錯 go，錯字本會顯示「午餐」。            */
  var WORD_INDEX = Object.create(null);

  // PDF 的單字欄位可能是 "a (an)"、"French fries"、"everyone everybody"、
  // 甚至 "T-shirt T恤"。要把裡面每一個英文詞都當成可查的 key，
  // 否則打錯 "a" 時會查不到、錯字本就顯示「字庫中查無此字」。
  function wordKeys(w) {
    var s = String(w == null ? '' : w)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9']+/g, ' ');
    var out = [];
    s.split(' ').forEach(function (t) { if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }

  function indexWord(en, zh, ipa, sid, uid) {
    wordKeys(en).forEach(function (k) {
      if (!WORD_INDEX[k]) WORD_INDEX[k] = { en: en, zh: zh, ipa: ipa, sid: sid, uid: uid };
    });
  }

  function buildWordIndex() {
    DATA.scenarios.forEach(function (sc) {
      sc.units.forEach(function (u) {
        indexWord(u.target, u.gloss, u.ipa || '', sc.id, u.id);
        u.steps.forEach(function (st) {
          if (st.kind !== 'word') return;
          indexWord(st.en, st.zh, wordIpa(st.en), sc.id, u.id);
        });
      });
    });
  }

  // 單字步驟的音標欄位是整步的音標；單字層通常剛好就是那個字，
  // 多字的情況則重新查一次表，避免把整句音標塞給單字。
  function wordIpa(en) {
    var k = wordKeys(en);
    if (k.length === 1 && WORD_INDEX[k[0]]) return WORD_INDEX[k[0]].ipa;
    return '';
  }

  function bumpMistake(word) {
    var k = word.toLowerCase();
    var rec = state.mistakes[k];
    if (!rec) {
      var keys = wordKeys(word);
      var idx = null;
      for (var i = 0; i < keys.length; i++) {
        if (WORD_INDEX[keys[i]]) { idx = WORD_INDEX[keys[i]]; break; }
      }
      var u = curUnit();
      rec = state.mistakes[k] = idx
        // en 記「實際打錯的那個字」——錯字本的目的就是把那個字練對，
        // 顯示成字庫裡的另一種寫法（例如 a (an)）反而不好找。
        // canon 保留字典正解，中文與音標都取自它。
        ? { en: word, canon: idx.en, zh: idx.zh, ipa: idx.ipa,
            n: 0, sid: idx.sid, uid: idx.uid }
        : { en: word, canon: '', zh: '（字庫中查無此字）', ipa: '', n: 0,
            sid: state.scenarioId, uid: u.id };
    }
    rec.n++;
    saveAll();          // 錯字要立刻落盤，等不及下一次存檔
  }

  function updateBadges() {
    $('mistakeCount').textContent = Object.keys(state.mistakes).length;
  }

  function renderMistakes() {
    var box = $('mistakeList');
    var keys = Object.keys(state.mistakes).sort(function (a, b) {
      return state.mistakes[b].n - state.mistakes[a].n;
    });
    box.innerHTML = '';
    if (!keys.length) {
      box.innerHTML = '<div class="empty">還沒有錯字，繼續保持！</div>';
      return;
    }
    keys.forEach(function (k) {
      var m = state.mistakes[k];
      var row = document.createElement('div');
      row.className = 'mrow';
      row.title = '點這裡直接重練這個字所在的單元（會清掉該步已打的字）' +
        (m.canon && m.canon !== m.en ? '\n字庫條目：' + m.canon : '');
      row.innerHTML =
        '<span class="mrow__w">' + esc(m.en) + '</span>' +
        '<span class="mrow__z">' + esc(m.zh || '') +
        (m.ipa ? ' <span class="mono" style="opacity:.65">/' + esc(m.ipa) + '/</span>' : '') +
        '</span>' +
        '<span class="mrow__n">錯 ' + m.n + ' 次</span>';
      row.onclick = function () {
        openScenario(m.sid);
        var us = curUnits();
        for (var i = 0; i < us.length; i++) {
          if (us[i].id !== m.uid) continue;
          state.unitIndex = i;
          // 跳到「真的會出現這個字」的那一步，讓學生重打的就是錯過的字
          var si = 0;
          for (var j = 0; j < us[i].steps.length; j++) {
            if (wordKeys(us[i].steps[j].en).indexOf(k) >= 0) { si = j; break; }
          }
          state.stepIndex = si;
          progressOf(m.sid).cur = { unit: i, step: si };
          // 清掉該步已存的字，確保是真的重打而不是看到舊答案
          delete progressOf(m.sid).words[m.sid + '|' + us[i].id + '|' + si];
          saveAll();
          renderPractice();
          break;
        }
      };
      box.appendChild(row);
    });
  }

  function gotoUnitTo(i, step) {
    state.unitIndex = i;
    state.stepIndex = step || 0;
    progressOf(state.scenarioId).cur = { unit: i, step: state.stepIndex };
    saveAll();
    renderPractice();
  }

  /* ------------------------------------------------------------ 查單字 */
  var BROWSE_ROWS = [];      // 扁平化的全部單字
  var browseScen = 'all';

  function buildBrowseRows() {
    BROWSE_ROWS = [];
    DATA.scenarios.forEach(function (sc) {
      sc.units.forEach(function (u) {
        var last = u.steps[u.steps.length - 1];
        BROWSE_ROWS.push({
          en: u.target, zh: u.gloss, ipa: u.ipa || '',
          sid: sc.id, scenTitle: sc.title, scenIcon: sc.icon,
          level: u.level, uid: u.id,
          ex: last.en, exZh: last.zh
        });
      });
    });
  }

  // 把查詢字串命中的一小段包起來，方便眼睛定位
  function hl(text, q) {
    if (!q) return esc(text);
    var t = String(text == null ? '' : text);
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) +
           '</mark>' + esc(t.slice(i + q.length));
  }

  // 切到指定場景後，回傳該單元在「目前等級篩選」下的索引
  function curUnitsAfter(sid, uid) {
    var sc = scenarioById(sid);
    if (!sc) return -1;
    var us = unitsOf(sc);
    for (var i = 0; i < us.length; i++) if (us[i].id === uid) return i;
    return -1;
  }

  function renderBrowse() {
    var q = $('searchInput').value.trim();
    var box = $('browseList');
    box.innerHTML = '';

    var rows = BROWSE_ROWS.filter(function (r) {
      if (browseScen !== 'all' && r.sid !== browseScen) return false;
      if (!q) return true;
      var lq = q.toLowerCase();
      return r.en.toLowerCase().indexOf(lq) >= 0
          || r.zh.indexOf(q) >= 0
          || (r.ipa && r.ipa.indexOf(lq) >= 0)
          || r.ex.toLowerCase().indexOf(lq) >= 0
          || String(r.exZh || '').indexOf(q) >= 0;
    });

    $('searchCount').textContent =
      q ? rows.length + ' / ' + BROWSE_ROWS.length + ' 筆' : '共 ' + rows.length + ' 筆';

    if (!rows.length) {
      box.innerHTML = '<div class="empty">找不到符合「' + esc(q) + '」的字</div>';
      return;
    }

    // 沒有搜尋字串時一次畫 889 列太慢，只顯示前 200 筆
    var shown = q ? rows : rows.slice(0, 200);
    shown.forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'wrow';
      el.title = '點這裡跳到「' + esc(r.en) + '」所屬的場景開始練習';
      el.innerHTML =
        '<div class="wrow__main">' +
          '<div class="wrow__top">' +
            '<span class="wrow__w">' + hl(r.en, q) + '</span>' +
            (r.ipa ? '<span class="wrow__ipa">/' + hl(r.ipa, q) + '/</span>' : '') +
            '<span class="wrow__z">' + hl(r.zh, q) + '</span>' +
          '</div>' +
          '<div class="wrow__ex"><span class="en">' + hl(r.ex, q) + '</span>　' +
            hl(r.exZh, q) + '</div>' +
        '</div>' +
        '<div class="wrow__side"><span class="sc">' + esc(r.scenIcon + ' ' + r.scenTitle) +
        '</span><br>' + r.level + ' 級 · ' + esc(r.uid) + '</div>';
      el.onclick = function () {
        openScenario(r.sid);
        var idx = curUnitsAfter(r.sid, r.uid);
        if (idx >= 0) gotoUnitTo(idx);
      };
      box.appendChild(el);
    });

    if (!q && rows.length > shown.length) {
      var more = document.createElement('div');
      more.className = 'meta';
      more.style.textAlign = 'center';
      more.style.padding = '10px';
      more.textContent = '只顯示前 200 筆，輸入關鍵字可以縮小範圍';
      box.appendChild(more);
    }
  }

  function openBrowse() {
    if (!BROWSE_ROWS.length) buildBrowseRows();
    var chips = $('browseScenChips');
    if (!chips.childNodes.length) {
      var mk = function (id, label) {
        var b = document.createElement('button');
        b.className = 'chip' + (id === 'all' ? ' on' : '');
        b.textContent = label;
        b.onclick = function () {
          browseScen = id;
          [].forEach.call(chips.childNodes, function (c) { c.classList.remove('on'); });
          b.classList.add('on');
          renderBrowse();
        };
        chips.appendChild(b);
      };
      mk('all', '全部');
      DATA.scenarios.forEach(function (sc) { mk(sc.id, sc.icon + ' ' + sc.title); });
    }
    renderBrowse();
    showView('browse');
    $('searchInput').focus();
  }

  /* ------------------------------------------------------------ 統計 */
  function renderStats() {
    var box = $('statsList');
    var rows = [];
    DATA.scenarios.forEach(function (sc) {
      var us = sc.units, p = state.progress[sc.id] || { done: {} };
      var ts = 0, ds = 0, units = 0, udone = 0;
      us.forEach(function (u) {
        units++;
        var arr = p.done[u.id] || [];
        if (arr.length) udone++;
        u.steps.forEach(function () { ts++; });
        ds += arr.length;
      });
      rows.push({ name: sc.icon + ' ' + sc.title, pct: ts ? Math.round(ds / ts * 100) : 0,
                  txt: udone + ' / ' + units + ' 單元', key: sc.id });
    });
    rows.sort(function (a, b) { return b.pct - a.pct; });
    box.innerHTML = rows.map(function (r) {
      return '<div class="statRow"><span class="statRow__n">' + esc(r.name) + '</span>' +
        '<span class="statRow__b"><i style="width:' + r.pct + '%"></i></span>' +
        '<span class="statRow__v">' + r.pct + '% · ' + r.txt + '</span></div>';
    }).join('');

    var mk = Object.keys(state.mistakes).length;
    var totalMiss = Object.keys(state.mistakes)
      .reduce(function (a, k) { return a + state.mistakes[k].n; }, 0);
    var extra = document.createElement('div');
    extra.className = 'card-box';
    extra.style.marginTop = '18px';
    extra.innerHTML =
      '<div class="sec__title" style="margin-top:0">整體紀錄</div>' +
      '<div class="meta">累積出錯字數：<b>' + totalMiss + '</b> 次　·　' +
      '進錯字本的單字：<b>' + mk + '</b> 個</div>';
    box.appendChild(extra);
  }

  /* ------------------------------------------------------------ 解析面板：資料檢核 */
  function validatePanelData() {
    var sc = curScenario(), u = curUnit(), s = curStep();
    if (!sc || !u || !s) return [];

    var issues = [];
    var stepId = sc.id + '/' + u.id + '/' + state.stepIndex;

    // 1. 檢核必要欄位
    if (!s.en || !s.en.trim()) issues.push({ level: 'error', code: 'MISSING_EN', msg: '缺少英文內容', step: stepId });
    if (!s.zh || !s.zh.trim()) issues.push({ level: 'warn', code: 'MISSING_ZH', msg: '缺少中文翻譯', step: stepId });
    if (!s.kind) issues.push({ level: 'error', code: 'MISSING_KIND', msg: '缺少步驟類型', step: stepId });
    if (!s.src) issues.push({ level: 'warn', code: 'MISSING_SRC', msg: '缺少來源標記', step: stepId });

    // 2. 檢核音標
    if (s.kind === 'sentence' && (!s.ipa || !s.ipa.trim())) {
      issues.push({ level: 'warn', code: 'MISSING_IPA_SENTENCE', msg: '整句類型缺少音標', step: stepId });
    }
    if (s.kind === 'word' && (!s.ipa || !s.ipa.trim())) {
      issues.push({ level: 'warn', code: 'MISSING_IPA_WORD', msg: '單字類型缺少音標', step: stepId });
    }

    // 3. 檢核英文句子基本語法
    if (s.en && s.kind === 'sentence') {
      var en = s.en.trim();
      // 首字母大寫
      if (en && en[0] !== en[0].toUpperCase()) {
        issues.push({ level: 'warn', code: 'GRAMMAR_LOWERCASE_START', msg: '句子首字未大寫：' + en, step: stepId });
      }
      // 句末標點
      if (en && !/[.!?][\"'’”」』]?$/.test(en)) {
        issues.push({ level: 'warn', code: 'GRAMMAR_NO_END_PUNCT', msg: '句子缺少結尾標點：' + en, step: stepId });
      }
      // 字數過少：只有 1 個字卻標成「整句」才是真的資料錯誤。
      // 2 字的命令句／疑問句（Stand up. / What's this?）是完全正確的英文，
      // 不能用 <3 課閾值，否則 13 個正常單元會被誤判。
      if (en.split(/\s+/).length < 2) {
        issues.push({ level: 'error', code: 'GRAMMAR_TOO_SHORT', msg: '標為整句但只有 1 個字：' + en, step: stepId });
      }
      // 不應包含中文字符
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(en)) {
        issues.push({ level: 'error', code: 'GRAMMAR_HAS_CJK', msg: '英文句子包含中文字符：' + en, step: stepId });
      }
      // 不應以小寫開頭（除非是代名詞 i）
      var firstWord = en.match(/^[A-Za-z']+/);
      if (firstWord && firstWord[0].toLowerCase() !== 'i' && firstWord[0] !== firstWord[0].charAt(0).toUpperCase() + firstWord[0].slice(1)) {
        issues.push({ level: 'warn', code: 'GRAMMAR_FIRST_WORD_CASE', msg: '第一個單字大小寫異常：' + firstWord[0], step: stepId });
      }
    }

    // 4. 檢核中文翻譯
    if (s.zh) {
      var zh = s.zh.trim();
      if (!zh) {
        issues.push({ level: 'warn', code: 'ZH_EMPTY', msg: '中文翻譯為空', step: stepId });
      }
      // 中文不應過多英文（除了專有名詞）
      var asc = (zh.match(/[A-Za-z]/g) || []).length;
      var cjk = (zh.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjk === 0 && asc > 0) {
        issues.push({ level: 'warn', code: 'ZH_ONLY_ASCII', msg: '中文翻譯全為英文：' + zh, step: stepId });
      }
      if (cjk > 0 && asc > cjk * 3) {
        issues.push({ level: 'warn', code: 'ZH_TOO_MUCH_ASCII', msg: '中文翻譯英文過多：' + zh, step: stepId });
      }
      // 括號配對
      if (/[（(][^）)]*$/.test(zh)) {
        issues.push({ level: 'warn', code: 'ZH_UNBALANCED_PAREN', msg: '中文括號未配對：' + zh, step: stepId });
      }
    }

    // 5. 檢核單元層級資料
    if (!u.target || !u.target.trim()) issues.push({ level: 'error', code: 'UNIT_MISSING_TARGET', msg: '單元缺少目標單字', step: stepId });
    if (!u.gloss || !u.gloss.trim()) issues.push({ level: 'warn', code: 'UNIT_MISSING_GLOSS', msg: '單元缺少中文釋義', step: stepId });
    if (!u.ipa || !u.ipa.trim()) issues.push({ level: 'warn', code: 'UNIT_MISSING_IPA', msg: '單元缺少音標', step: stepId });

    // 6. 檢核單元步驟完整性
    var kinds = u.steps.map(function(st) { return st.kind; });
    var hasWord = kinds.indexOf('word') >= 0;
    var hasPhrase = kinds.indexOf('phrase') >= 0;
    var hasSentence = kinds.indexOf('sentence') >= 0;
    if (!hasWord) issues.push({ level: 'warn', code: 'UNIT_NO_WORD_STEP', msg: '單元缺少單字步驟', step: stepId });
    if (!hasPhrase) issues.push({ level: 'warn', code: 'UNIT_NO_PHRASE_STEP', msg: '單元缺少詞組步驟', step: stepId });
    if (!hasSentence) issues.push({ level: 'warn', code: 'UNIT_NO_SENTENCE_STEP', msg: '單元缺少整句步驟', step: stepId });

    // 7. 檢核每個步驟的必要欄位
    u.steps.forEach(function(st, i) {
      var sid = stepId + '/step' + i;
      if (!st.en || !st.en.trim()) issues.push({ level: 'error', code: 'STEP_MISSING_EN', msg: '步驟 ' + (i+1) + ' 缺少英文', step: sid });
      if (!st.zh || !st.zh.trim()) issues.push({ level: 'warn', code: 'STEP_MISSING_ZH', msg: '步驟 ' + (i+1) + ' 缺少中文', step: sid });
      if (!st.kind) issues.push({ level: 'error', code: 'STEP_MISSING_KIND', msg: '步驟 ' + (i+1) + ' 缺少類型', step: sid });
      if (st.kind === 'sentence' && (!st.ipa || !st.ipa.trim())) {
        issues.push({ level: 'warn', code: 'STEP_MISSING_IPA', msg: '步驟 ' + (i+1) + ' (整句) 缺少音標', step: sid });
      }
    });

    return issues;
  }

  /* ------------------------------------------------- 108 課綱常見錯誤與修正 */
  /*  對照 108 課綱國中英文「學習表現」：辨識主題、句型結構、語法運用。
      每一條都寫成 錯誤(X) → 正確(O) → 為什麼 → 理解技巧，
      讓解析面板不只是講答案，而是教「自己怎麼發現錯」。            */
  function es3(word) {
    // is/box/bus/brush 加 es；子音 + y 變 ies。
    // 注意：-o 不在這個規則裡——zoo/radio/photo/piano/video 都只加 s，
    //       只有 potato/tomato/hero 這幾個才加 es，題庫沒有這些字。
    if (/[sx]$/i.test(word) || /(ch|sh)$/i.test(word)) return word + 'es';
    if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies');
    return word + 's';
  }

  /* 拼寫 h 不發音的字：前面要用 an，不能用 a。教科書等級的例外只有這幾個。 */
  var SILENT_H = { hour: 1, hours: 1, honest: 1, honestly: 1, honor: 1, honours: 1, honorable: 1 };

  /* 過去式／不規則動詞：這些字不能加 -s，否則會教出 "gots" 這種錯英文。 */
  var PAST_OR_IRREG = {};
  ('was were had did said went came took saw got made found gave knew thought ' +
   'told felt left kept heard held brought began wrote stood spoke ran lost paid ' +
   'met sat won understood forgot grew drew chose fell sent built sleep slept ' +
   'wake woke wear wore tear tore break broke choose chose fly flew blow blew ' +
   'grow grew know knew throw threw drive drove ride rode rise rose eat ate ' +
   'drink drank swim swam sing sang ring rang sink sank speak spoke steal stole ' +
   'wake woke write wrote ride rode rise rose shake shook take took mistake ' +
   'beaten beat bite bit blow blew break brought build burnt burn buy bought ' +
   'catch caught cost cut do does done draw dream drank drive eaten fall fed ' +
   'fight fought find found fit flee flew forbid forgot forgive froze get got ' +
   'give given go gone grind ground hang have heard hide hit hurt keep kept ' +
   'kneel lay lead leap learn leave lend let lie light lose made mean meet ' +
   'pay put quit read rebuild rid ring rise run say saw see seek sell send ' +
   'set sew shake shed shine shoot show shut sing sink sit slide smell ' +
   'sow speed spell spend spill split spoil spread spring stand steal stick ' +
   'sting strike swear sweep swell swim swing teach tear tell think throw ' +
   'thrust tread understand upset wake wear weave weep wet win wind withdraw ' +
   'won wound write').split(/\s+/).forEach(function (w) { if (w) PAST_OR_IRREG[w] = 1; });

  /* 頻率／語氣副詞：出現在主詞和動詞之間，「He still works」的動詞是 works，
     不是 still。沒有這份清單會教出 "He stills" 這種錯英文。                */
  var ADVERBS = {};
  ('still often seldom always never sometimes usually normally generally typically ' +
   'just also really very already hardly rarely certainly probably definitely simply ' +
   'already almost nearly quite rather too enough especially particularly mainly ' +
   'now then soon later today tomorrow tonight yesterday here there ' +
   // 地點／方向副詞與禮語：這些字不是名詞，
   // 漏收會讓 "go abroad" 的 abroad、"Come in, please" 的 please
   // 都掉成名詞。
   'abroad ahead inside outside upstairs downstairs everywhere nowhere anywhere ' +
   'somewhere away back forth please ago least instead however aloud apart ' +
   'almost well fast hard late early together alone maybe perhaps ' +
   // so 是副詞不是連接詞："The baby is so small"、"so much"、"so proud"
   'so such quite really very ' +
   // 單字片語步驟會用到這些頻率／肯定／否定副詞，
   // 漏收會讓獨立的 "ever" / "once" / "yes" 掉成名詞。
   'else ever even yet yes once twice again no not barely absolutely ' +
   'certainly indeed surely moreover nevertheless nonetheless instead')
    .split(/\s+/).forEach(function (w) { if (w) ADVERBS[w] = 1; });

  /* 不規則過去式與過去分詞 → 原形。
     verbBase() 只會去 -s / -ed，處理不了 came / born 這類，
     沒有這張表的話它們會整顆掉成名詞。                    */
  var IRREG_PAST = {};
  ('has=have does=do says=say gets=get goes=go comes=come makes=make ' +
   'takes=take sees=see knows=know thinks=think tells=tell asks=ask ' +
   'gives=give finds=find puts=put keeps=keep lets=let begins=begin ' +
   'seems=seem helps=help talks=talk turns=turn starts=start shows=show ' +
   'hears=hear runs=run moves=move lives=live believes=believe holds=hold ' +
   'brings=bring happens=happen writes=write sits=sit stands=stand ' +
   'loses=lose pays=pay meets=meet includes=include continues=continue ' +
   'sets=set learns=learn changes=change leads=lead understands=understand ' +
   'watches=watch follows=follow stops=stop creates=create speaks=speak ' +
   'reads=read allows=allow adds=add spends=spend grows=grow opens=open ' +
   'walks=walk wins=win offers=offer loves=love considers=consider ' +
   'appears=appear buys=buy waits=wait serves=serve dies=die sends=send ' +
   'expects=expect builds=build stays=stay falls=fall cuts=cut reaches=reach ' +
   'kills=kill remains=remain eats=eat drinks=drink sleeps=sleep wakes=wake ' +
   'wears=wear carries=carry breaks=break chooses=choose draws=draw ' +
   'drives=drive feels=feel fights=fight flies=fly forgets=forget ' +
   'forgives=forgive hides=hide hits=hit hurts=hurt lays=lay leaves=leave ' +
   'lends=lend lies=lie lights=light means=mean quits=quit rides=ride ' +
   'rings=ring rises=rise sells=sell shakes=shake shoots=shoot shuts=shut ' +
   'sings=sing sinks=sink smells=smell spells=spell steals=steal sticks=stick ' +
   'strikes=strike swears=swear swims=swim teaches=teach tears=tear ' +
   'throws=throw wakes=wake wishes=wish works=work plays=play studies=study ' +
   'tries=try uses=use calls=call enjoys=enjoy finishes=finish ' +
   'practices=practice cleans=clean washes=wash dresses=dress cooks=cook ' +
   'boils=boil fries=fry orders=order visits=visit jogs=jog dances=dance ' +
   'jumps=jump kicks=kick catches=catch scores=score joins=join ' +
   'looks=look listens=listen waits=wait arrives=arrive returns=return ' +
   'enters=enter exits=exit closes=close pushes=push pulls=pull picks=pick ' +
   'drops=drop raises=raise touches=touch fixes=fix paints=paint ' +
   'colors=color counts=count copies=copy answers=answer hates=hate ' +
   'prefers=prefer agrees=agree disagrees=disagree decides=decide ' +
   'plans=plan prepares=prepare organizes=organize arranges=arrange ' +
   'schedules=schedule books=book reserves=reserve cancels=cancel ' +
   'confirms=confirm checks=check verifies=verify compares=compare ' +
   'shares=share borrows=borrow lends=lend owes=owe earns=earn ' +
   'saves=save wastes=waste costs=cost charges=charge bills=bill ' +
   'shops=shop affords=afford collects=collect feeds=feed tastes=taste ' +
   'sips=lip chews=chew swallows=swallow digests=digest bakes=bake ' +
   'roasts=roast grills=grill burns=burn freezes=freeze melts=melt ' +
   'heats=heat cools=cool warms=warm pours=pour mixes=mix stirs=stir ' +
   'chops=chop slices=slice peels=peel rinses=rinse dries=dry ' +
   'wraps=wrap packs=pack loads=load delivers=deliver ships=ship ' +
   'mails=mail receives=receive accepts=accept rejects=reject ' +
   'exchanges=exchange replaces=replace repairs=repair tidies=tidy ' +
   'decorates=decorate furnishes=furnish rents=rent leases=lease ' +
   'owns=own morts=mortgage moves=move relocates=relocate settles=settle ' +
   'travels=travel tours=tour explores=explore discovers=discover ' +
   'journeys=journey commutes=commute departs=depart passes=pass ' +
   'crosses=cross turns=turn hurries=hurry rushes=rush slows=slow ' +
   'speeds=speed sprints=sprint climbs=climb crawls=crawl dives=dive ' +
   'floats=float ' +
   // 真正的過去式與過去分詞
   'came=come went=go saw=see ate=eat drank=drink ran=run sang=sing swam=swim ' +
   'wrote=write rode=ride drove=drive flew=fly blew=blow grew=grow ' +
   'threw=throw knew=know took=take gave=give made=make said=say told=tell ' +
   'felt=feel found=find thought=think brought=bring bought=buy caught=catch ' +
   'taught=teach fought=fight lost=lose paid=pay met=meet sat=sit stood=stand ' +
   'understood=understand forgot=forget woke=wake wore=wear tore=tear ' +
   'broke=break chose=choose froze=freeze spoke=speak stole=steal shook=shake ' +
   'shot=shoot shone=shine sank=sink lay=lie led=lead left=leave lent=lend ' +
   'sent=send spent=spend built=build dealt=deal meant=mean dreamt=dream ' +
   'learnt=learn burnt=burn spelt=spell knelt=kneel crept=creep leapt=leap ' +
   'wept=weep swept=sweep slept=sleep slid=slide bit=bite hid=hide held=hold ' +
   'let=let set=set shut=shut split=split spread=spread put=put ' +
   'cut=cut hit=hit cost=cost read=read beat=beat become=become began=begin ' +
   'drunk=drink rung=ring sung=sing swum=swim written=write ridden=ride ' +
   'driven=drive flown=fly blown=blow grown=grow thrown=throw known=know ' +
   'taken=take given=give seen=see eaten=eat fallen=fall hidden=hide ' +
   'broken=break chosen=choose frozen=freeze spoken=speak stolen=steal ' +
   'woken=wake worn=wear torn=tear risen=rise borne=bear born=bear ' +
   'beaten=beat bitten=bite gotten=get forgotten=forgive raised=raise')
    .split(/\s+/).forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      if (p.length === 2 && p[0] && p[1]) IRREG_PAST[p[0]] = p[1];
    });

  /* 冠詞後面的字如果是這些功能詞，表示前面那個 a / A 不是冠詞
     （例：Class A and Class B ... 的 A 是班級代號）。                  */
  var NOT_AFTER_ARTICLE = {};
  ('and or but is are was were be been am do does did has have had of to in on at ' +
   'for with from by not no a an the if so than that this these those as it he she ' +
   'they we you i').split(/\s+/).forEach(function (w) { if (w) NOT_AFTER_ARTICLE[w] = 1; });

  /* 過去式／不規則動詞：這些字不能加 -s，否則會教出 "becames" 這種錯英文。 */
  var PAST_OR_IRREG = {};
  ('was were had did said went came took saw got made found gave knew thought ' +
   'told felt left kept heard held brought began wrote stood spoke ran lost paid ' +
   'met sat won understood forgot grew drew chose fell sent built slept woke wore ' +
   'tore broke flew blew threw drove rode rose ate drank swam sang rang sank ' +
   'spoke stole wrote became become comes came did does done eaten fell felt ' +
   'found gave gone got grow had has hear held hide hit hurt keep kept knew ' +
   'laid lay led learnt left lent let lie lost made meant met paid put ran read ' +
   'said saw sold sent set shook shot showed shut sang sat slept slid smelt ' +
   'sold spent spoke spelt sprang stood stole stuck stung struck swore swept ' +
   'swam swept swung took taught tore told thought threw thrust trod understood ' +
   'upheld upset woke wore wound wrote').split(/\s+/)
    .forEach(function (w) { if (w) PAST_OR_IRREG[w] = 1; });

  /* 主詞動詞一致（He / She / It + 現在簡單式動詞）的「去變化」：
     es3() 的逆向，用來產生「忘記加 s」的錯誤版本。
       studies → study（ies 變 y）
       watches → watch、goes → go（去 es）
       plays   → play（去 s）                                    */
  function base3(v) {
    if (/ies$/i.test(v)) return v.replace(/ies$/i, 'y');
    if (/(ches|shes|sses|xes|zes|oes)$/i.test(v)) return v.replace(/es$/i, '');
    return v.replace(/s$/i, '');
  }

  /* 目標單字的所有可能寫法：
     "father (dad,daddy)"        → father / dad / daddy
     "goose / geese"             → goose / geese
     "PE(physical education)"    → pe / physical / education
     "fisherman / fishermen"     → fisherman / fishermen
     只取第一個字的話，句子用到別名時會找不到，第五章就空了。        */
  function targetVariants(target) {
    var s = String(target || '').toLowerCase();
    s = s.replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9'\/ ]+/g, ' ');
    var out = [];
    s.split(/[\s\/]+/).forEach(function (w) {
      if (!w || w.length < 2) return;
      if (out.indexOf(w) < 0) out.push(w);
    });
    return out;
  }
  /* 句子裡有沒有出現目標單字的某一種寫法（含字形變化）：
     wave / waving、become / became、build / built 這一類不規則變化，
     用「共同前 3 個字母」判斷，寧可漏也不要誤判。               */
  function targetAppears(sent, variants) {
    var words = String(sent || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/);
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var stem = v.slice(0, Math.min(3, v.length));
      for (var j = 0; j < words.length; j++) {
        if (!words[j]) continue;
        if (words[j] === v) return { found: true, word: v };
        if (stem.length >= 3 && words[j].slice(0, 3) === stem) return { found: true, word: words[j] };
      }
    }
    return { found: false, word: '' };
  }

  function curriculum108(unit, step) {
    var out = [];
    var sent = String(step.en || '');
    var target = String(unit.target || '').toLowerCase();
    var lowSent = sent.toLowerCase();

    function push(tag, bad, ok, why, tip) {
      out.push({ tag: tag, bad: bad, ok: ok, why: why, tip: tip });
    }
    // 把句子裡第一個 oldWord 換成 newWord（只換獨立單字，不動子字串）
    function swap(s, oldWord, newWord) {
      return s.replace(new RegExp('\\b' + oldWord + '\\b', 'i'), newWord);
    }

    // ── ① be 動詞與主詞一致 ─────────────────────────────
    // 原句用對的時候，把「換成另一個 be 動詞」當錯誤版本 (X)、原句當 (O)。
    // 只在句首的單純代名詞上判斷：複合主詞（My cousin and I are ...）
    // 是複數，用 are 是對的，不能拿 and 前面的片段下結論。
    var beSent = sent.match(/^\s*(I|He|She|It|You|We|They)\s+(am|is|are)\b/i);
    if (beSent) {
      var subjB = beSent[1].toLowerCase(), verbB = beSent[2].toLowerCase();
      var wantBe = 'are';
      if (subjB === 'i') wantBe = 'am';
      else if (subjB === 'he' || subjB === 'she' || subjB === 'it') wantBe = 'is';
      var wrongBe = wantBe === 'am' ? 'is' : (subjB === 'i' ? 'are' : (wantBe === 'is' ? 'are' : 'is'));
      if (verbB !== wantBe) {
        push('be 動詞與主詞一致',
          '(X) ' + beSent[1] + ' ' + verbB,
          '(O) ' + beSent[1] + ' ' + wantBe,
          subjB + ' 要配 ' + wantBe + '，不是 ' + verbB + '。',
          '理解技巧：I 用 am，he / she / it（單數）用 is，you / we / they（複數）用 are。' +
          '先找主詞再選動詞，不要用中文「是」直接對應。');
      } else {
        push('be 動詞與主詞一致',
          '(X) ' + swap(sent.trim(), verbB, wrongBe),
          '(O) ' + sent.trim(),
          subjB + ' 要配 ' + wantBe + '，不是 ' + wrongBe + '。',
          '理解技巧：I 用 am，he / she / it（單數）用 is，you / we / they（複數）用 are。' +
          '先找主詞再選動詞，不要用中文「是」直接對應。');
      }
    }

    // ── ② 第三人稱單數：He / She / It + 現在簡單式動詞要加 -s ─────────────────
    var subjV = sent.match(/^\s*(He|She|It)\s+([\s\S]*)$/);
    if (subjV) {
      var subjW = subjV[1];
      var rest = subjV[2];
      var toks = rest.split(/(\s+)/);                 // 保留空白，重組時不跑掉
      var verbTok = null, verbTokI = -1;
      for (var ti = 0; ti < toks.length; ti++) {
        var tk = toks[ti];
        if (!tk || /^\s+$/.test(tk)) continue;
        var core = tk.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
        if (!core) continue;                             // 純標點
        var cl = core.toLowerCase();
        if (ADVERBS[cl] === 1) continue;                 // still / often 之後才是動詞
        if (/^(is|am|are|was|were|has|have|had|can|could|will|would|should|does|do|did|don't|doesn't|didn't|must|may|might|not)$/.test(cl)) { verbTok = null; break; }
        if (PAST_OR_IRREG[cl] === 1) { verbTok = null; break; }
        if (/ing$/i.test(core) || /ed$/i.test(core)) { verbTok = null; break; }
        verbTok = core; verbTokI = ti; break;
      }
      if (verbTok) {
        var hasS = /(s|es)$/i.test(verbTok);
        if (hasS) {
          var bare = base3(verbTok);
          var badToks = toks.slice();
          badToks[verbTokI] = toks[verbTokI].replace(verbTok, bare);
          push('主詞動詞一致',
            '(X) ' + subjW + ' ' + badToks.join('').trim(),
            '(O) ' + sent.trim(),
            '主詞是 ' + subjW + '（單數第三人稱），動作是「現在的習慣或事實」時，動詞要加 -s：' +
            bare + ' → ' + verbTok + '。',
            '理解技巧：先問「主詞是 he / she / it ∕ 單數一個人嗎？」→ 是，動詞就加 s。' +
            '再問「動作是現在還是過去？」→ 過去用 was / had 或過去式，不加第二個 s。');
        } else {
          var fixed = es3(verbTok);
          var okToks = toks.slice();
          okToks[verbTokI] = toks[verbTokI].replace(verbTok, fixed);
          push('主詞動詞一致',
            '(X) ' + sent.trim(),
            '(O) ' + subjW + ' ' + okToks.join('').trim(),
            '主詞是 ' + subjW + '（單數第三人稱），現在的習慣或事實，動詞要加 -s：' +
            verbTok + ' → ' + fixed + '。',
            '理解技巧：看到 he / she / it 開頭，先檢查動詞有沒有 s；' +
            '沒有就是這裡漏了。');
        }
      }
    }

    // ── ③ 冠詞 a / an ──────────────────────────────────────
    // 看發音不看拼字。h 不發音的字（hour / honest）要用 an。
    // 排除：單一字母代號（Class A）、後面接功能詞的假冠詞（A and ...）。
    var artRe = /\b(a|an)\s+([A-Za-z']{2,})/gi;
    var am;
    while ((am = artRe.exec(sent)) !== null) {
      var article = am[1], w2 = am[2].toLowerCase();
      if (NOT_AFTER_ARTICLE[w2] === 1) continue;
      // 大寫冠語只在句首合法；句中的 "Class A" 之類一律跳過
      var isUpper = article !== article.toLowerCase();
      var atStart = /^\s*$/.test(sent.slice(0, am.index));
      if (isUpper && !atStart) continue;

      var needAn = /^[aeiou]/.test(w2) || SILENT_H[w2] === 1;
      var correct = needAn ? 'an' : 'a';
      var wrongArt = needAn ? 'a' : 'an';
      var isSilentH = SILENT_H[w2] === 1;

      if (article.toLowerCase() !== correct) {
        push('冠詞 a / an',
          '(X) ' + article + ' ' + am[2],
          '(O) ' + correct + ' ' + am[2],
          w2 + ' 的第一個音是母音，前面要用 an。',
          '理解技巧：啟出來的第一個音是 a / e / i / o / u 就用 an，其他用 a。' +
          '特別記住 hour / honest 拼 h 但唏母音，要用 an。');
      } else if (isSilentH) {
        push('冠詞 a / an（h 不發音）',
          '(X) a ' + am[2] + '（h 不發音，用 a 是錯的）',
          '(O) an ' + am[2],
          w2 + ' 的 h 不發音，第一個音是母音，要用 an。',
          '理解技巧：hour / honest 這一類字拼 h 但唏母音開頭，' +
          '所以是 an hour、an honest man。看到 h 先唏一次再決定。');
      } else {
        push('冠詞 a / an',
          '(X) ' + swap(sent.trim(), article, wrongArt),
          '(O) ' + sent.trim(),
          w2 + ' 的第一個音不是母音，前面要用 a，不是 an。',
          '理解技巧：唏出來的第一個音是 a / e / i / o / u 就用 an，其他用 a。' +
          '特別記住 hour / honest 拼 h 但唏母音，要用 an。');
      }
    }

    // ── ④ 時間介系詞 in / on / at ────────────────────────────────
    var TIME_MAP = {
      morning: 'in', afternoon: 'in', evening: 'in',
      monday: 'on', tuesday: 'on', wednesday: 'on', thursday: 'on',
      friday: 'on', saturday: 'on', sunday: 'on',
      night: 'at', noon: 'at', midnight: 'at'
    };
    var TIME_TIP = {
      morning: '早上用 in；at 用於幾點，on 用於星期。',
      afternoon: '下午用 in；at 用於幾點，on 用於星期。',
      evening: '晚上用 in；at 用於幾點，on 用於星期。',
      night: 'night 用 at（at night）；in the morning 才用 in。',
      noon: 'noon 用 at（at noon）。',
      midnight: 'midnight 用 at（at midnight）。'
    };
    var preps = sent.match(/\b(in|on|at)\s+(the\s+)?([A-Za-z']+)/gi);
    if (preps) {
      for (var pi = 0; pi < preps.length; pi++) {
        var pm = preps[pi].match(/\b(in|on|at)\s+(the\s+)?([A-Za-z']+)/i);
        if (!pm) continue;
        var pword = pm[3].toLowerCase();
        var want = TIME_MAP[pword];
        if (!want) continue;
        var tip = TIME_TIP[pword] || '大口詜「AT 點鐘 ON 天 IN 早晚」。';
        if (pm[1].toLowerCase() !== want) {
          push('時間介系詞 in / on / at',
            '(X) ' + sent.trim(),
            '(O) ' + swap(sent.trim(), pm[1], want),
            pword + ' 要配 ' + want + '，不是 ' + pm[1].toLowerCase() + '。',
            '理解技巧：' + tip);
        } else {
          var wrongPrep = want === 'in' ? 'on' : 'in';
          push('時間介系詞 in / on / at',
            '(X) ' + swap(sent.trim(), pm[1], wrongPrep),
            '(O) ' + sent.trim(),
            pword + ' 要配 ' + want + '，不是 ' + wrongPrep + '。',
            '理解技巧：' + tip);
        }
      }
    }

    // ── ⑤ 目標單字運用（監判所有寫法，不只看第一個字） ──────────────────
    var variants = targetVariants(unit.target);
    var hit = targetAppears(sent, variants);
    var showWord = hit.found ? hit.word : (variants[0] || String(unit.target || ''));
    if (hit.found) {
      push('目標單字運用',
        '(X) 打完這一題就直接跳下一題，沒有回頭看 ' + showWord,
        '(O) 指向自己的答案：這一句裡 ' + showWord + ' 拼對了嗎？位置放對了嗎？',
        '這個單元練的是「' + unit.target + '（' + (unit.gloss || '') + '）」，' +
        '這句話就是你第一次真正用到它的地方。',
        '理解技巧：用手指著螢幕上的 ' + showWord + '，唏出它的中文，' +
        '再唏一次整句「「唏得出來」比「看得懂」更能發現問題。');
    }

    // ── ⑥ 保底：前面的規則都沒呵中時，用原句當 (O) 的自我檢查 ──────────────────────
    // 這樣第五章不會空。(X) 是行為描述，不是被判斷的英文，所以永遠安全。
    if (!out.length && sent.trim()) {
      push('這一句的自我檢查',
        '(X) 打完就直接按下一個單元，沒有重新唏一次',
        '(O) 重新從頭唏一次：' + sent.trim(),
        '這一步練的是「' + unit.target + '（' + (unit.gloss || '') + '）」。' +
        '把整句唏出來，比一個字一個字看更容易發現問題。',
        '理解技巧：指著螢幕一個字一個字唏，' +
        '特別檢查三個地方：① 主詞和 be 動詞有沒有配對 ' +
        '② 名詞該不該加 s ③ 介系詞（in / on / at / of / for）放對了嗎。');
    }

    return out;
  }

  /* ------------------------------------------------- 延伸範例句子（Alt+Z 面板用） */
  /*  題庫每一步只有一句例子，但 108 課綱要求學生能「舉一反三」。
      這裡用句型模板依詞性產生 3~5 句延伸例句，每一句都帶中文與陷阱提示，
      讓學生看到同一個字在不同句型裡長什麼樣子。                            */
  function baseWord(target) {
    // "father (dad,daddy)" → father；"a (an)" → a；"yeah(=yes)" → yeah；"Mrs." → Mrs
    var t = String(target || '').trim();
    t = t.replace(/\s*[（(][^）)]*[）)]\s*$/, '');   // 去掉尾端 (...)
    t = t.replace(/\s*=.*$/, '');                   // 去掉尾端 (=yes)
    t = t.split(/\s+/)[0];
    return t.replace(/[.,;:!?]+$/, '').trim();
  }

  var VERB_HINT = /^(做|去|來|看|聽|說|讀|寫|拿|放|丟|跑|跳|走|坐|站|打開|關掉|打|踢|玩|吃|喝|買|賣|給|幫|找|等|帶|借|還|救|殺|咬|餵|舉|拍照|出發|到達|離開|相信|希望|擔心|喜歡|討厭|想|要|需要|應該|能夠|必須|練習|學習|記住|忘記|開始|結束|繼續|停止|完成|準備|整理|打掃|洗|刷|穿|戴|脫|試|抱|親|分享|照顧|回答|問|告訴|知道|認為|覺得|變成|生長|長大|出生|死|生病|痊癒|醒來|睡覺|起床|工作|賺|花|存|付|贏|輸|得分|慶祝|許願|彈|演奏|唱|畫|使用|轉彎|過馬路|騎|開|搭|浪費|挑|選|收|折|蓋|燒|煮|炒|切|吞|吹|拉|推|點|擦|摸|碰|握|抓|牽|搖|點頭|鞠躬|揮手|微笑|笑|哭|喊|叫|飛|游|爬|滾|滑|衝|闖|逃|躲|追|趕|拯救|殺死|同意|反對|決定|選擇|期待|原諒|感謝|恭喜|歡迎|告別|介紹|解釋|描述|討論|報告|邀請|參加|出席|參觀|拜訪|聯絡|通知|提醒|警告|命令|請求|建議|勸|阻止|允許|禁止|拒絕|接受|責備|稱讚|批評|抱怨|道歉|假裝|複製|列印|下載|上傳|張貼|搜尋|瀏覽|播放|暫停|重複|錄音|錄影|報導|採訪|宣佈|宣傳|廣告|推銷|付款|找零|退貨|換貨|預約|訂位|訂票|退票|簽證|通關|入境|出境|移民|留學|打工|創業|辭職|退休|升遷|降職|錄取|開除|解僱|聘僱|訓練|指導|輔導|領導|管理|經營|投資|成長|上漲|下跌|拍賣|競標|簽約|解約|違約|訴訟|起訴|判刑|釋放|特赦|翻案|重審|抗議|遊行|示威|靜坐|罷工|罷課|抵制|制裁|禁運|交|宣戰|停戰|議和|講和|和解|調解|調停|妥協|讓步|投降|征服|佔領|殖民|解放|獨立|自主|公投|選舉|競選|投票|開票|當選|落選|連任|卸任|接任|繼任|傳承|輪替|革新|改革|改良|改善|改正|糾正|矯正|補救|彌補|挽回|補償|賠償|理賠|索標|討債|還債|借債|欠債|慢跑|飛翔|游泳)/;

  // 功能詞／虛詞：這些字本身不是實物，硬套名詞或形容詞模板會產生
  // 「I have a a.」「This is very yeah.」這種不通的句子。
  // 它們只用最安全的通用句型（問拼字、問意思），不猜詞類。
  var FUNCTION_WORDS = {};
  'a an am are is was were be been being the this that these those of to in on at up down off into out over under about with by for from and or but so if not no yes very really too also still only even almost enough each other another else same both few many some every lot lots there here it he she i you we they me my your his her its our their do does did done has have had can could will would shall should may might must yeah ok okay what which who whom whose when where why how'.split(/\s+/)
    .forEach(function (w) { FUNCTION_WORDS[w] = 1; });

  // 量詞清單：只收「本身不是名詞」的單位，避免把「杯子」誤判成「杯」。
  var MEASURE_WORDS = {};
  ('一雙 一打 一組 一筆 一枚 一隻 一條 一盤 一蓋 一場 一軸 一撮 一副 一對 一把 一盒 一袋 一箱 一瓶 一束 一疊')
    .split(/\s+/).forEach(function (x) { if (x) MEASURE_WORDS[x] = 1; });

  // 動詞第三人稱：給 es3 用的不規則清單
  var THIRD_IRREG = { do: 'does', go: 'goes', have: 'has', try: 'tries', carry: 'carries' };
  function thirdPerson(v) {
    var lv = v.toLowerCase();
    if (THIRD_IRREG[lv]) return THIRD_IRREG[lv];
    return es3(v);
  }

  // 中文釋義收尾：拼句型時要能拿掉「的」「了」，否則會出現「太大的了」「很熱的的女孩」。
  // bare=true  去掉語尾「的／了」→ 拼 "很 + ___" 用
  // noun=true  保留原樣       → 拼 "___的女孩" 用
  function zh(g, mode) {
    var s = String(g || '').trim();
    if (mode === 'bare' || mode === 'noun') {
      s = s.replace(/[的了]+$/, '');
    }
    return s;
  }

  // 數字單字（one..ten, eleven..twenty ...）——108 課綱最愛考 number + 複數名詞
  var NUMBER_WORDS = {};
  ('one two three four five six seven eight nine ten ' +
   'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty ' +
   'thirty forty fifty sixty seventy eighty ninety hundred thousand million dozen first second third').split(/\s+/)
    .forEach(function (w) { NUMBER_WORDS[w] = 1; });

  function exampleSentences(unit) {
    var w = baseWord(unit.target);
    if (!w) return [];
    var gloss = String(unit.gloss || '');
    var lw = w.toLowerCase();

    var out = [];
    function add(en, zhT, trap) {
      if (out.some(function (o) { return o.en === en; })) return;
      out.push({ en: en, zh: zhT, trap: trap });
    }

    // 功能詞（a / am / yeah 這類）不是實物，硬套名詞或形容詞模板會產生
    // 「I have a a.」「This is very yeah.」這種不通的句子，所以只用安全句型。
    if (FUNCTION_WORDS[lw]) {
      add('How do you spell "' + w + '"?', '「' + w + '」怎麼拼？',
          '問拼字用 how do you spell，不是 how to spell it。');
      add('What does "' + w + '" mean?', '「' + w + '」是什麼意思？',
          '問字義用 what ... mean，不是 how ... mean。');
      // 功能詞真正的用法要看整句，從單元的整句步驟取，絕對正確
      var st = unit.steps.filter(function (s) { return s.kind === 'sentence'; })[0]
             || unit.steps[unit.steps.length - 1];
      if (st) add(st.en, st.zh || '', '讀整句最能感覺這個字真正的用法。');
      return out.slice(0, 5);
    }

    // 量詞（一雙、一打…）：這些字不能單獨當名詞用，硬套會產生
    // 「我有一個一雙」這種不完整的句子。
    // 用精確比對而不是關鍵字——「杯子」裡面也有「杯」，不能誤判成量詞。
    var isMeasure = MEASURE_WORDS[gloss] === 1;

    if (isMeasure) {
      var stM = unit.steps.filter(function (s2) { return s2.kind === 'sentence'; })[0]
              || unit.steps[unit.steps.length - 1];
      if (stM) add(stM.en, stM.zh || '', '這個字要搭配使用，單看字不完整，讀整句最直接。');
      add('I want a ' + lw + ' of shoes.', '我要' + gloss + '鞋子。',
          'a ' + lw + ' of ... 是「' + gloss + '...」的固定搭配，' + lw + ' 不能單獨使用。');
      add('How do you spell "' + w + '"?', '「' + w + '」怎麼拼？',
          '問拼字用 how do you spell，不是 how to spell it。');
      return out.slice(0, 5);
    }

    if (NUMBER_WORDS[lw]) {
      // 數字：考點是 number + 複數名詞，不是 an eight
      add('I have ' + lw + ' books.', '我有' + gloss + '本書。',
          '數字後面接複數名詞，不加 a / an，且名詞要加 s。');
      add('She has ' + lw + ' apples.', '她有' + gloss + '個蘋果。',
          '第三人稱 she 用 has；數字後面的可數名詞用複數。');
      add('There are ' + lw + ' students in the class.', '班上有' + gloss + '個學生。',
          'there are 配複數，不是 there is。');
      add('I get up at ' + lw + '.', '我' + gloss + '點起床。',
          'at 用於「幾點」，in 用於早上／下午。');
      return out.slice(0, 5);
    }

    var isVerb = VERB_HINT.test(gloss);
    var isAdj = !isVerb && (/的$/.test(gloss) ||
      /(紅色|綠色|藍色|黃色|黑色|白色|顏色|大的|小的|長的|短的|高的|矮的|胖的|瘦的|快的|慢的|新的|舊的|好的|壞的|多的|少的|冷的|熱的|暖的|亮的|暗的|乾淨|髒的|整齊|吵的|忙的|累的|餓的|渴的|開心|難過|生氣|害怕|重要|容易|困難|危險|安全|有名|聰明|誠實|友善|勇敢|客氣|努力|有趣|無聊|奇怪|認真|瘋狂|自由|真實|方便|優秀|棒的|漂亮|帥的|可愛|可憐|特別|普通|同一|不同|完整|足夠|正確|真的|假的|早的|晚的|遲的|閒的|滿的|空的|深的|淺的|厚的|薄的|寬的|窄的|粗的|細的|尖的|鈍的|彎的|直的|圓的|方的|平的|斜的|舒適|舒服|快樂|悲傷|憤怒|恐懼|緊張|放鬆|驚喜|感動|感激|感恩|欣慰|滿足|失望|絕望|無奈|無助|孤單|寂寞|充實|空虛|茫然|迷失|徬徨|猶豫|果斷|堅定|軟弱|頑強|倔強|固執|隨和|包容|體貼|溫柔|仁慈|慈悲|殘忍|冷酷|無情|自私|無私|奉獻|犧牲|付出|收穫|成長|茁壯|衰落|腐敗|清廉|貪污|公正|偏頗|客觀|主觀|理性|感性|冷靜|衝動|謹慎|魯莽|大膽|膽小|勇敢|懦弱)/.test(gloss));

    if (isVerb) {
      var v3 = thirdPerson(w);
      add('I ' + lw + ' every day.', '我每天都' + gloss + '。', 'every day 表示習慣，用現在式即可，不用 be + -ing。');
      add('She ' + v3 + ' in the morning.', '她早上' + gloss + '。', '第三人稱 she 作主詞，現在式動詞要變化（' + w + ' → ' + v3 + '）。');
      add('They ' + lw + ' together.', '他們一起' + gloss + '。', 'together 是副詞，放句尾修飾整句。');
      add('Can you ' + lw + ' with me?', '你能跟我一起' + gloss + '嗎？', 'can 是情態動詞，後面接動詞原形，不加 to、不加 s。');
      add('I want to ' + lw + ' now.', '我現在想' + gloss + '。', 'want to 後面一律接動詞原形。');
    } else if (isAdj) {
      var bare = zh(gloss, 'bare');
      // 情緒／性格類形容詞用「人」當主詞才自然（I am very happy），
      // 大小／顏色／形狀類用「東西」當主詞（This is very big）。
      var isPersonAdj = /(快樂|開心|高興|難過|傷心|生氣|憤怒|害怕|恐懼|緊張|放鬆|滿足|失望|絕望|無奈|無助|孤單|寂寞|迷茫|迷失|猶豫|堅定|頑強|固執|聰明|誠實|友善|勇敢|客氣|努力|有趣|無聊|奇怪|認真|瘋狂|自由|真實|優秀|棒|漂亮|帥|可愛|可憐|特別|普通|懶惰|善良|體貼|溫柔|仁慈|殘忍|冷酷|無情|自私|無私|公正|客觀|冷靜|衝動|謹慎|魯莽|大膽|膽小|累|餓|渴|忙|閒|誠實|有禮|健康|生病|死|活|年輕|老)/.test(gloss);
      var subj = isPersonAdj ? 'I am' : 'This is';
      var subjZh = isPersonAdj ? '我很' : '這個很';
      add(subj + ' very ' + lw + '.', subjZh + bare + '。', 'very 修飾形容詞，不用 very much（much 是修飾動詞）。');
      add('It looks ' + lw + '.', '它看起來很' + bare + '。', 'look / sound / smell 後面接形容詞，不加 -ly。');
      add('She is ' + (/^[aeiou]/.test(lw) || SILENT_H[lw] === 1 ? 'an' : 'a') + ' ' + lw + ' girl.', '她是一個很' + bare + '的女孩。', '形容詞放名詞前面修飾它。');
      add('He is not ' + lw + ' today.', '他今天不' + bare + '。', 'be 動詞否定是 be + not + 形容詞，not 不加到形容詞上。');
    } else {
      // 名詞：a / an 依發音決定；複數交給 es3（-s/-x/-ch/-sh 加 es，子音+y 變 ies）
      // a / an 依發音決定；h 不發音的字（hour / honest）也要用 an。
      // 只看首字母的話，hour 會產生"a hour"這種錯英文。
      var art = (/^[aeiou]/.test(lw) || SILENT_H[lw] === 1) ? 'an' : 'a';
      var plural = es3(lw);
      add('I have ' + art + ' ' + lw + '.', '我有一個' + gloss + '。',
          art === 'an' ? 'an 用於母音開頭的字，看發音不看拼字。' :
          '單數可數名詞不能單獨出現，前面要加 a / an / the / my。');
      add('Do you like ' + plural + '?', '你喜歡' + gloss + '嗎？',
          'like 後面接複數表示「喜歡這一類」（' + plural + '，注意拼字），不加 the。');
      add('These ' + plural + ' are very good.', '這些' + gloss + '很好。',
          'these / those 後面一定接複數名詞。');
      add('Look at the ' + lw + '.', '你看這個' + gloss + '。',
          '祈使句用動詞原形開頭，主詞 you 省略。');
    }

    return out.slice(0, 5);
  }
  var PREPS = { 'of': 1, 'in': 1, 'on': 1, 'at': 1, 'for': 1, 'from': 1, 'to': 1,
                'with': 1, 'by': 1, 'about': 1, 'into': 1, 'than': 1, 'after': 1,
                'before': 1, 'under': 1, 'over': 1, 'near': 1, 'behind': 1,
                'beside': 1, 'between': 1,
                'along': 1, 'without': 1, 'except': 1, 'onto': 1, 'past': 1,
                'among': 1, 'through': 1, 'across': 1, 'upon': 1, 'within': 1,
                'during': 1, 'besides': 1, 'toward': 1, 'towards': 1, 'against': 1,
                'beyond': 1, 'beneath': 1, 'underneath': 1, 'alongside': 1,
                'above': 1, 'below': 1, 'upstairs': 1, 'downstairs': 1,
                'indoors': 1, 'outdoors': 1 };

  /* 片語動詞的副詞粒子：這些字既能當副詞也能當介系詞，
     「stand up」的 up 是副詞，「walk up the hill」的 up 是介系詞。
     用「後面有沒有接名詞片語」來分辨，比一律當某一類準。            */
  var PARTICLES = {};
  ('up down off out away around back along apart aside over under in on').split(/\s+/)
    .forEach(function (w) { if (w) PARTICLES[w] = 1; });

  /* 並列／全體限定詞：both / either / neither 放在名詞前，當限定詞教最恰當 */
  var DETS2 = {};
  ('both either neither each every all some any most many few several enough other another '
   + 'more most less fewer much '
   // such 也是限定詞：「such as」、「such a good idea」
   + 'such')
    .split(/\s+/).forEach(function (w) { if (w) DETS2[w] = 1; });

  /* 「粒子 + 名詞」的固定搭配，這些都是介系詞。
     沒有這份表的話 in summer / on sale 會被誤判成副詞粒子——
     它們和「get off work」的 off 一樣是「粒子 + 小寫名詞」，只能靠對照表分辨。 */
  var PREP_COLLOCATIONS = {};
  ('in fact,in art,in class,in music,in writing,in trouble,in public,in front,'
   + 'in spring,in summer,in autumn,in fall,in winter,in lakes,in big,in modern,'
   + 'in elementary,in junior,in senior,in time,in town,in bed,in school,in church,'
   + 'on sale,on vacation,on weekends,on special,on glasses,on business,on time,'
   + 'on thursday,on tuesday,on wednesday,on monday,on friday,on saturday,on sunday,'
   + 'on you,on tv,on foot,on purpose,on holiday')
    .split(',').forEach(function (k) { if (k) PREP_COLLOCATIONS[k] = 1; });
  var MODALS = { 'can': 1, 'could': 1, 'should': 1, 'would': 1, 'will': 1,
                 'must': 1, 'may': 1, 'might': 1, 'shall': 1 };
  var BE = { 'is': 1, 'am': 1, 'are': 1, 'was': 1, 'were': 1, 'be': 1, 'been': 1, 'being': 1 };
  var DETS = { 'the': 1, 'a': 1, 'an': 1, 'my': 1, 'your': 1, 'his': 1, 'her': 1,
               'its': 1, 'their': 1, 'our': 1, 'this': 1, 'that': 1, 'these': 1,
               'those': 1, 'every': 1, 'some': 1, 'many': 1, 'no': 1 };
  var QW = /^(how|what|where|when|who|why|which|whose|whether)$/;

  /* ── 詞性標註用的字表 ────────────────────────────────────────────
     原來的 structure() 只有一份很短的虛詞表，其餘一律標成「名詞」，
     結果 Put / knows / playing / I / to / five / tallest 全被標成名詞，
     學生看到的詞性對照表有一半以上是錯的。
     這裡補上代名詞、連接詞、副詞、常用動詞與形容詞字表，
     再用狀態機判斷主詞與動詞，寧可標「不確定」也不標錯。          */
  var PRONOUNS = {};
  ('i me my mine myself you your yours yourself we us our ours ourselves ' +
   'he him his himself she her hers herself it its itself they them their theirs ' +
   'themselves one ones someone somebody something anyone anybody anything ' +
   'everyone everybody everything nobody nothing everyone everybody ' +
   // 不定副詞也當代名詞教："somewhere else" 的 somewhere
   'somewhere anywhere everywhere nowhere')
    .split(/\s+/).forEach(function (w) { if (w) PRONOUNS[w] = 1; });

  var CONJUNCTIONS = {};
  ('and or but because if while after before until since although though ' +
   'whether as than that however therefore besides moreover otherwise ' +
   'instead whenever wherever whatever whoever ' +
   // so 不放在這裡："The baby is so small" 的 so 是副詞不是連接詞。
   // when 也不放：疑問詞與連接詞由句子結構決定。
   'when').split(/\s+/).forEach(function (w) { if (w) CONJUNCTIONS[w] = 1; });

  /* 常用動詞：只用「原型／第三人稱都在這張表裡」的高頻字，
     這樣 know / knows、go / goes 都能命中，又不會把名詞誤判成動詞。 */
  var VERBS = {};
  ('be have do go come get make take see look want need like know think say tell ' +
   'ask give find put keep let begin seem help talk turn start show hear run move ' +
   'live believe hold bring happen write sit stand lose pay meet include continue ' +
   'set learn change lead understand watch follow stop create speak read allow add ' +
   'spend grow open walk win offer love consider appear buy wait serve die send ' +
   'expect build stay fall cut reach kill remain eat drink sleep wake wear carry ' +
   'break choose draw drive eat feel fight fly forget forgive get give go grow hang ' +
   'hide hit hold hurt keep know lay lead leave lend let lie light lose make mean ' +
   'meet pay put quit read ride ring rise run say see sell send set shake shoot show ' +
   'shut sing sit sleep smell speak spend stand steal stick strike swear swim take ' +
   'teach tear tell think throw understand wake wear win write work play study try ' +
   'use call enjoy finish practice clean wash brush wear dress cook boil fry order ' +
   'visit ride fly drive walk jog swim dance sing jump kick throw catch hit score ' +
   'win lose join watch look listen wait arrive leave return enter exit open close ' +
   'push pull pick drop raise touch hold carry break fix build make create draw ' +
   'paint color count spell write read copy answer ask question love hate prefer ' +
   'agree disagree believe decide choose plan prepare organize arrange schedule ' +
   'book reserve cancel confirm check verify compare share borrow lend owe pay ' +
   'earn save waste cost charge bill buy sell shop spend afford save collect ' +
   'eat feed taste smell sip chew swallow digest serve cook bake roast grill burn ' +
   'freeze melt heat cool warm pour mix stir cut chop slice peel wash rinse dry ' +
   'wrap pack unpack load carry deliver ship mail receive accept reject refuse ' +
   'return exchange replace repair fix clean dirty tidy organize decorate furnish ' +
   'rent lease own rent buy sell mortgage move relocate settle emigrate immigrate ' +
   'travel tour visit explore discover adventure journey commute arrive depart ' +
   'leave return come go enter exit exit enter pass cross turn stop wait hurry ' +
   'rush slow speed walk run jog sprint climb crawl swim dive float sink fly ' +
   'drive ride cycle skate ski sail surf row paddle trek hike camp lodge stay ' +
   'wake sleep nap rest relax work labor toil retire quit resign hire fire employ ' +
   'manage lead direct supervise train teach tutor coach mentor guide advise ' +
   'counsel consult negotiate bargain argue debate discuss explain describe ' +
   'announce declare report publish broadcast stream download upload post share ' +
   'like dislike love adore admire respect honor trust doubt suspect fear worry ' +
   'hope wish dream imagine suppose assume guess predict expect anticipate await ' +
   'enjoy appreciate value cherish treasure prize admire praise thank congratulate ' +
   'apologize forgive blame accuse complain protest object approve endorse support ' +
   'oppose resist fight defend protect guard shield shelter rescue save help aid ' +
   'assist serve volunteer donate give offer provide supply furnish deliver bring ' +
   'fetch carry transport transfer move shift lift lower raise drop release free ' +
   'open unlock lock close seal fasten tie bind wrap cover uncover expose reveal ' +
   'hide conceal disguise mask camouflage show display exhibit demonstrate illustrate ' +
   'prove confirm verify validate refute disprove deny admit confess concede ' +
   'agree comply obey disobey rebel revolt resist surrender yield submit capitulate ' +
   // 額外補上：題庫的句子裡有這些常規動詞。
   // 沒收的話 verbBase() 找不到原型，
   // attacked / rolled / cheated 這類 -ed 字會整個掉成名詞。
   'attack bite bear become cheat fail fill kiss marry name nod plant point roll ' +
   'stop surprise excite interest bore scare tire touch knock bang crash clap bow ' +
   'wave laugh smile cry shout whisper hug pat grab seize release spill splash ' +
   'drip leak flow stream hang attach fasten knot twist weave sew knit dig bury ' +
   'sow water prune trim mow rake hammer nail screw drill saw chop split carve ' +
   'sculpt mold shape beat whip fold bend stretch shrink expand count add subtract ' +
   'multiply divide calculate measure weigh spell pronounce translate interpret ' +
   'summarize compare contrast classify sort group arrange solve answer explain ' +
   'describe define discuss imitate copy repeat practice review memorize recite ' +
   'observe notice recognize identify discover explore investigate test examine ' +
   'inspect monitor track record improve develop progress advance decline worsen ' +
   'increase decrease reduce raise lower expand begin start end finish complete ' +
   'quit pause resume win lose tie draw lead trail follow chase defend guard ' +
   'protect escape flee argue quarrel disagree marry divorce engage produce ' +
   'deliver belong own possess lack need able unable mad angry calm married single')
    .split(/\s+/).forEach(function (w) { if (w) VERBS[w] = 1; });

  /* 常用形容詞：顏色、大小、感覺、評價都在這裡 */
  var ADJECTIVES = {};
  ('big small large little long short tall high low wide narrow thick thin deep ' +
   'shallow heavy light fast slow quick hot cold warm cool wet dry clean dirty ' +
   'new old young fresh early late good bad nice fine great awful terrible ' +
   'wonderful excellent perfect lovely beautiful pretty cute handsome ugly ' +
   'smart clever wise foolish stupid silly brave afraid scared happy sad angry ' +
   'glad sorry tired hungry thirsty sick ill healthy strong weak rich poor ' +
   'easy hard difficult simple complex cheap expensive free busy quiet loud ' +
   'noisy soft hard smooth rough sharp dull straight curved round square flat ' +
   'safe dangerous famous popular common strange normal usual special different ' +
   'same similar important necessary useful helpful kind friendly polite rude ' +
   'honest brave careful careless lucky unlucky true false real right wrong ready ' +
   'sure certain open closed full empty clean dirty near far close distant ' +
   'red orange yellow green blue purple pink brown black white gray gray colorful ' +
   'bright dark clear cloudy sunny rainy snowy windy foggy stormy fair chilly ' +
   'freezing boiling lukewarm tepid mild gentle wild tame domestic foreign ' +
   'local national international modern ancient old-fashioned trendy stylish ' +
   'casual formal comfortable uncomfortable convenient inconvenient possible ' +
   'impossible probable likely unlikely certain uncertain obvious clear evident ' +
   'apparent visible invisible audible silent fragrant stinky smelly tasty ' +
   'delicious yummy disgusting sweet sour bitter salty spicy bland fresh stale ' +
   'ripe raw cooked burnt tender tough juicy crispy crunchy chewy smooth creamy ' +
   'thick runny watery fatty greasy lean nutritious healthy unhealthy fattening ' +
   'hourly nightly daily everyday everyday sunny cloudy rainy stormy snowy ' +
   'windy foggy misty hazy clear bright dark dim gloomy cheerful merry jolly ' +
   'joyful delighted pleased content satisfied grateful thankful appreciative ' +
   'proud ashamed embarrassed shy confident eager enthusiastic passionate ' +
   'indifferent apathetic bored curious interested fascinated intrigued ' +
   'confused puzzled baffled bewildered lost found amazed astonished astounded ' +
   'surprised shocked startled stunned appalled horrified terrified panicked ' +
   'nervous anxious worried concerned uneasy restless impatient patient calm ' +
   'relaxed serene tranquil peaceful still quiet silent noisy loud deafening ' +
   'annoying irritating frustrating satisfying rewarding fulfilling meaningful ' +
   'pointless useless worthless valuable precious priceless cheap affordable ' +
   'expensive overpriced reasonable fair unfair just unjust equal uneven ' +
   'balanced stable unstable steady shaky firm rigid flexible elastic ' +
   'stretchable durable sturdy fragile delicate sturdy robust tough resilient ' +
   /* 分詞形容詞：和進行式動詞拼法一樣，
      不收的話 "Science is interesting" 的 interesting
      會被標成動詞（-ing）。 */
   'interesting exciting boring tiring surprising amazing confusing ' +
   'pleasing relaxing worrying frightening charming promising disappointed ' +
   'embarrassing encouraging discouraging exhausting refreshing thrilling ' +
   'stretchable durable sturdy fragile delicate sturdy robust tough resilient ' +
   // 分詞形容詞：和進行式動詞拼法一樣，
   // 不放這裡的話 "Science is interesting" 的 interesting
   // 會被標成動詞（-ing）。
   'interesting exciting boring tiring surprising amazing confusing ' +
   'pleasing relaxing worrying frightening charming promising disappointed ' +
   // able / mad / married 是常見的形容詞，
   // 漏掉會讓 "Jane is able to come" 的 able 掉成名詞。
   'able mad married single alive asleep awake afraid aware sure ' +
   'worth ready full empty careful careless useful useless ' +
   'similar different common strange normal usual particular ' +
   'favorite favourite perfect wonderful terrible lovely ' +
   'bored excited interested surprised tired scared frightened relaxed ' +
   'delighted pleased content satisfied grateful thankful ' +
   'embarrassed ashamed shy confident eager enthusiastic passionate ' +
   'indifferent apathetic curious fascinated intrigued confused ' +
   'puzzled baffled bewildered amazed astonished astounded ' +
   'surprised shocked startled stunned appalled horrified terrified ' +
   'panicked nervous anxious worried concerned uneasy restless ' +
   'impatient patient calm serene tranquil peaceful annoying ' +
   'irritating frustrating satisfying rewarding fulfilling meaningful ' +
   'pointless worthless valuable precious priceless affordable ' +
   'reasonable fair unjust equal uneven balanced stable unstable ' +
   'steady shaky firm rigid flexible elastic durable ' +
   'embarrassed interested bored excited tired surprised frightened relaxed')
    .split(/\s+/).forEach(function (w) { if (w) ADJECTIVES[w] = 1; });

  /* 比較級／最高級只能用「列出來的」，不能用 -er / -est 後綴猜——
     brother / father / teacher / water / never ever / dinner / summer / paper
     全部以 -er 結尾但都是名詞，猜後綴會把整張詞性表污染掉。          */
  /* 比較級並最高級只能「列出來的」，而且只能收單字。
     一定不要寫 more dangerous 這種「多字」條目：
     .split(/\s+/) 會把它分成 more 和 dangerous 兩個鍵，
     結果 dangerous / expensive / popular / beautiful 這些普通形容詞
     全被誨成比較級，整張詞性表都不對。
     more 和 most 也不收，因為這些句子裡它們是
     量詞（Drink more water / twenty more chairs，不是比較級）。 */
  var COMPARATIVE = {};
  ('bigger biggest smaller smallest larger largest longer longest '
   + 'shorter shortest taller tallest higher highest lower lowest older oldest '
   + 'younger youngest newer newest faster fastest slower slowest hotter hottest '
   + 'colder coldest warmer warmest cooler coolest better best worse worst '
   + 'greater greatest finer finest easier easiest harder hardest '
   + 'simpler simplest cheaper cheapest dearer dearest closer closest '
   + 'farther farthest further furthest happier happiest sadder saddest '
   + 'angrier angriest busier busiest heavier heaviest lighter lightest '
   + 'richer richest poorer poorest cleaner cleanest dirtier dirtiest '
   + 'tidier tidiest safer safest nicer nicest prettier prettiest '
   + 'uglier ugliest smarter smartest cleverer cleverest stronger strongest '
   + 'weaker weakest thicker thickest thinner thinnest wider widest '
   + 'deeper deepest shallower shallowest fuller fullest emptier emptiest '
   + 'louder loudest quieter quietest sooner soonest earlier earliest '
   + 'quicker quickest friendlier friendliest politer politest ruder rudest '
   + 'kinder kindest braver bravest elder eldest')
    .split(/\s+/).forEach(function (w) { if (w) COMPARATIVE[w] = 1; });

  /* 基數詞：one..twenty, thirty..ninety, hundred / thousand / million */
  var CARDINALS = {};
  ('one two three four five six seven eight nine ten eleven twelve thirteen ' +
   'fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty ' +
   'fifty sixty seventy eighty ninety hundred thousand million billion dozen ' +
   'first second third fourth fifth sixth seventh eighth ninth tenth')
    .split(/\s+/).forEach(function (w) { if (w) CARDINALS[w] = 1; });

  /* 縮寫：I'm / it's / don't ... 切成兩個 token 再判斷，
     否則 "I'm a student" 的 I'm 會被當成一個名詞。                */
  function splitContractions(toks) {
    var out = [];
    toks.forEach(function (tok) {
      var m = tok.match(/^([A-Za-z']+)'(s|re|ve|ll|d|m)$/);
      if (m) {
        out.push(m[1]);
        out.push("'" + m[2]);          // 's / 're / 've / 'll / 'd / 'm
        return;
      }
      // won't / can't / shan't 要還原成 will / can / shall + not，
      // 不然會切出 wo 這種不存在的字。
      var wn = /^(won|can|shan)'t$/.exec(tok.toLowerCase());
      if (wn) {
        var full = { won: 'will', can: 'can', shan: 'shall' }[wn[1]];
        out.push(full); out.push('not'); return;
      }
      var n = /^([A-Za-z']+)n't$/.exec(tok);
      if (n) { out.push(n[1]); out.push("n't"); return; }
      out.push(tok);
    });
    return out;
  }

  /* 結尾是 -s 但其實是單數的字：bus / is / news / series …
     以題庫的 unit.target 為測試標準（那些都是單數原型），
     再補一份常見的 -s 單數字。
     沒這個判斷的話，"The bus is late" 的 bus 會被標成名詞（複數）。 */
  /* 結尾是 -s 但其實是單數「名詞」：bus / news / series …
     注意：is / was / has / its / this / plus / us 這些是動詞或限定詞，不是名詞，
     放進來會讓 "lady has a heart" 的 has 被誨成單數名詞而不去當動詞。 */
  var SINGULAR_S_EXTRA = {};
  ('bus news series species gas glass class ' +
   'dress kiss miss box tax axis boss loss ' +
   'bias campus circus focus basis analysis crisis thesis ' +
   'christmas business illness weakness stress success address guess press ' +
   'usage damage courage language marriage voyage ' +
   'base case house mouse exercise please')
    .split(/\s+/).forEach(function (w) { if (w) SINGULAR_S_EXTRA[w] = 1; });

  /* 這些副詞跟在 be 動詞後面時要當形容詞：
     "The bus is late" 的 late 是形容詞，"I get up late" 的 late 才是副詞。 */
  var CONTEXT_ADJ = {};
  ('late early right back straight sure fine')
    .split(/\s+/).forEach(function (w) { if (w) CONTEXT_ADJ[w] = 1; });
  var _singularSCache = null;
  function isSingularS(w) {
    if (!_singularSCache) {
      _singularSCache = Object.create(null);
      // 題庫 target 裡的字都是單數原型
      (window.BANKS && window.BANKS.scenarios || []).forEach(function (sc) {
        (sc.units || []).forEach(function (u) {
          var base = String(u.target || '').toLowerCase()
            .replace(/\s*[（(][^）)]*[）)]\s*$/, '')
            .replace(/\s*=.*$/, '').split(/\s+/)[0]
            .replace(/[.,;:!?]+$/, '');
          if (/^[a-z]+s$/.test(base)) _singularSCache[base] = 1;
        });
      });
    }
    return SINGULAR_S_EXTRA[w] === 1 || _singularSCache[w] === 1;
  }

  /* 名詞的功能要按它在句子裡的位置來說，
     不然每個名詞都寫「句中的名詞成分」就沒教到東西。 */
  /* 序數（first / second / third…）和基數（one / two…）
     在句子裡的功能完全不同：一個數數量，一個數順序。 */
  var ordinalSet = {};
  ('first second third fourth fifth sixth seventh eighth ninth tenth ' +
   'eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth ' +
   'eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth ' +
   'seventieth eightieth ninetieth hundredth thousandth millionth ' +
   'twenty-first twenty-second twenty-third thirtieth')
    .split(/\s+/).forEach(function (w) { if (w) ordinalSet[w] = 1; });

  /* 代名詞四類，功能各不相同：
     主詞、受詞、所有格、反身。
     一律寫「代替前面提過的人或物」對 I / you 這類並不成立，
     因為它們不是指回前文。 */
  var SUBJECT_PRON = {};
  ('i you he she it we they who whoever').split(/\s+/)
    .forEach(function (w) { if (w) SUBJECT_PRON[w] = 1; });
  var POSSESSIVE_PRON = {};
  ('my your his her its our their whose').split(/\s+/)
    .forEach(function (w) { if (w) POSSESSIVE_PRON[w] = 1; });
  var REFLEXIVE_PRON = {};
  ('myself yourself himself herself itself ourselves themselves ' +
   'oneself').split(/\s+/).forEach(function (w) { if (w) REFLEXIVE_PRON[w] = 1; });

  function pronounFn(w, inObjectPosition) {
    var lw = w.toLowerCase();
    if (REFLEXIVE_PRON[lw]) return '反身代名詞，動作回到主詞自己身上';
    if (POSSESSIVE_PRON[lw]) return '所有格代名詞，表示「…的」，後面接名詞';
    if (SUBJECT_PRON[lw] && !inObjectPosition) {
      return '主詞代名詞，代替講話者、對方或講到的人，動詞要跟它配單複數';
    }
    return '受詞代名詞，放在動詞或介系詞後面';
  }

  /* 標點的功能：句號、逗號、問號、感嘆號各不相同。
     原本一律寫「逗號後面用小寫開頭」，對 ? 和 ! 並不成立。 */
  function punctFn(tok) {
    if (tok === '.') return '句子結束，下一句開頭要大寫';
    if (tok === ',') return '句中短短停一下，後面接小寫';
    if (tok === '?') return '疑問句結束，前面通常有疑問詞或 be ∕助動詞';
    if (tok === '!' || tok === '\u203c') return '感嘆或命令，語氣強烈';
    if (tok === ':' || tok === ';') return '連結前後，後面通常接列舉或說明';
    if (tok === "'" || tok === '\u2019') return '所有格或縮寫，表示所屬或動詞縮寫';
    if (tok === '"') return '引語，把別人謚的話包起來';
    return '標點符號，幫助句子方便閱讀';
  }

  /* 介系詞裡 at / on / in 的時間地點用法
     是學生最愛損的，單獨提出來。 */
  function prepFn(w) {
    if (w === 'at') return 'at 用於幾點（at ten）、小地點（at school）、街\u9053號碼';
    if (w === 'on') return 'on 用於星期（on Monday）、日期、表面接觸（on the table）';
    if (w === 'in') return 'in 用於早上\u2215下午\u2215晚上、月份、年、大地點與內部（in the box）';
    if (w === 'of') return 'of 表示所屬或分量；a cup of tea、the king of animals';
    if (w === 'for') return 'for 表示目的、時間長度或對象：for you、for three days';
    if (w === 'with') return 'with 表示一起、工具或帶有：with me、write with a pen';
    if (w === 'from') return 'from 表示起點或來源：from Taiwan、a letter from Mom';
    if (w === 'to') return 'to 表示方向或目的地：go to school';
    if (w === 'by') return 'by 表示交通工具、方式或動作主體：by bus、written by Mom';
    return '後面接名詞或 -ing，不能接動詞原形';
  }

  function nounFn(hasVerb, afterPrep, afterBe) {
    if (!hasVerb) return '句子的主詞，動詞要跟它配單複數';
    if (afterBe) return '主詞補語，接在 be 動詞後面說明主詞是什麼';
    if (afterPrep) return '介系詞後面的賓語，接在介系詞後面';
    return '動詞的受詞，接在動詞後面接受動作';
  }

  function structure(sent) {
    var toks = splitContractions(
      sent.match(/[A-Za-z'\u2019]+|[0-9]+|[^\sA-Za-z0-9']/g) || []);
    var rows = [];
    var sawSubject = false;
    var sawVerb = false;
    var afterDet = false;
    var prevWasPronounObj = false;   // Let me know / tell him to go
    var prevWasTo = false;           // want to be → be 是動詞原形
    var prevWasModal = false;        // should do → do 是動詞
    var prevWasConj = false;         // Mina and Mike → Mike 也是名詞
    var prevWasLet = false;          // Let's get / Let me know → 下一個是動詞
    var prevWasBe = false;           // be born / was opened → 後面是過去分詞
    var prevWasBeAt = -1;            // be 動詞的位置，用來確保分詞緊接在後
    var prevWasAdj = false;          // big enough → enough 是副詞不是限定詞
    var prevWasPrep = false;         // 介系詞後面的名詞是賓語

    // 動詞的第三人稱／複原：knows → know、studies → study、watches → watch
    // 注意 -es 只能在「標準拼字」出現時去掉（watches→watch、goes→go）。
    // 無條件去掉的話 'bees'.replace(/es$/,'') 會變成 'be'，
    // 把 bees（bee 的複數）誤判成 be 的變化型。
    function verbBase(w) {
      if (VERBS[w]) return w;
      if (IRREG_PAST[w] && VERBS[IRREG_PAST[w]]) return IRREG_PAST[w];
      if (VERBS[w.replace(/ies$/, 'y')]) return w.replace(/ies$/, 'y');
      if (/(ches|shes|sses|xes|zes|oes)$/i.test(w)) {
        var b1 = w.replace(/es$/i, '');
        if (VERBS[b1]) return b1;
      }
      // 重複子音過去式：nodded → nod、stopped → stop、planned → plan。
      // 去掉 -ed 會得到 nodd／stopp／plann，還要再退一個重複字母才對。
      var dd = /^([a-z]+)([a-z])\2ed$/.exec(w);
      if (dd && dd[1].length >= 2 && VERBS[dd[1] + dd[2]]) return dd[1] + dd[2];
      var b2 = w.replace(/s$/i, '');
      if (VERBS[b2]) return b2;
      if (VERBS[w.replace(/ing$/, '')]) return w.replace(/ing$/, '');
      if (VERBS[w.replace(/ing$/, 'e')]) return w.replace(/ing$/, 'e');
      if (VERBS[w.replace(/ed$/, '')]) return w.replace(/ed$/, '');
      if (VERBS[w.replace(/d$/, '')]) return w.replace(/d$/, '');
      return null;
    }
    // 從屬連接詞：後面是新子句，要重新找動詞（if it rains → rains 是動詞）
    var SUBORD = /^(if|when|while|because|although|though|after|before|until|since|unless|so)$/;

    // 句中大寫開頭、但不是功能詞的字 → 專有名詞（人名地名）
    // "Mr. Lin was..." 的 Lin / "except Ted" 的 Ted / "see Frank" 的 Frank
    // 英文正寫法裡功能詞不會在句中被大寫，所以「大寫 + 在句中」基本上就是專有名詞：
    // May（五月，不是情態動詞 may）、Mark、Will 都是這種情況。
    function isFunctionWordMidSentence(tok) {
      // 大寫開頭（但不是全大寫、也不是 I）→ 當專有名詞，不查功能詞表
      if (/^[A-Z][a-z]/.test(tok) && tok !== 'I') return false;
      var w = tok.toLowerCase();
      return BE[w] || MODALS[w] || QW.test(w) || DETS[w] || DETS2[w] ||
             PREPS[w] || CONJUNCTIONS[w] || PRONOUNS[w] || ADVERBS[w] ||
             COMPARATIVE[w] || CARDINALS[w] || ADJECTIVES[w] || PARTICLES[w];
    }

    toks.forEach(function (tok, i) {
      var w = tok.toLowerCase();

      function emit(pos, fn, showTok) {
        rows.push({ tok: showTok || tok, pos: pos, fn: fn, mark: 'O' });
      }

      // ⑴ 標點
      if (/^[^\sA-Za-z0-9']$/.test(tok)) {
        afterDet = false; prevWasPronounObj = false; prevWasTo = false;
        prevWasModal = false; prevWasConj = false; prevWasLet = false; prevWasBe = false; prevWasBeAt = -1;
        emit('標點', punctFn(tok));
        return;
      }
      // ⇒ 句首複數主詞：「句首 -s 字 + 第二個字是動詞」時，句首那個是複數名詞。
      //   "Leaves change colors in autumn." 的 Leaves 是葉子（複數名詞）
      //   "plants grow" 的 plants 是植物（複數名詞）
      // 排除第二個字是 -ing 的情況："goes jogging" 的 goes 才是動詞，
      // jogging 是動名詞補語。
      if (i === 0 && /s$/.test(w) && !isSingularS(w)) {
        var nxtTok = toks[1] ? toks[1].toLowerCase() : '';
        var nxtIsMainVerb = !!nxtTok && !/ing$/.test(nxtTok) &&
          (BE[nxtTok] || VERBS[nxtTok] || VERBS[nxtTok.replace(/s$/, '')] ||
           VERBS[nxtTok.replace(/es$/, '')] || IRREG_PAST[nxtTok]);
        if (nxtIsMainVerb) {
          sawSubject = true; afterDet = false; prevWasPronounObj = false;
          prevWasTo = false; prevWasModal = false; prevWasConj = false;
          emit('名詞（複數）', '句首的主詞，複數名詞別漏掉 s');
          return;
        }
      }
      // ⇒ 提早判斷專有名詞：只要位於句中（i > 0）、大寫開頭、
      // 且不是任何功能詞就當專有名詞。
      // 必須提早，否則 Thanksgiving 會先被 -ing 覆蓋、
      // May 會先被情態動詞覆蓋。
      // 除外：前面是句號時不當專有名詞〈“It's OK. This is...”的 This〉，
      // 但 J.K. Rowling 這種【前面是單字母頭字母 + 句號】的仍然是。
      if (i > 0 && /^[A-Z]/.test(tok) && tok !== 'I' && !isFunctionWordMidSentence(tok)) {
        var prevTok = toks[i - 1] || '';
        var prevIsSentenceEnd = /^[.!?]$/.test(prevTok) &&
                                 !(i >= 2 && /^[A-Z]$/.test(toks[i - 2] || ''));
        if (!prevIsSentenceEnd) {
          afterDet = false; prevWasConj = false; prevWasPronounObj = false;
          prevWasTo = false; prevWasModal = false; prevWasLet = false;
          prevWasBe = false; prevWasBeAt = -1;
          sawSubject = true;
          emit('名詞（專有名詞）', '人名、地名或特有名稱，第一個字母永遠大寫');
          return;
        }
      }
      // ② 純數字
      if (/^[0-9]+$/.test(tok)) {
        afterDet = true; prevWasTo = false;
        emit(ordinalSet[w] ? '數詞（序數）' : '數詞（基數）',
             ordinalSet[w]
               ? '表示順序（第幾），前面通常加 the'
               : '表示數量；two 以上後面的可數名詞要用複數（one 則用單數）');
        return;
      }
      // ③ 基數詞
      if (CARDINALS[w] && !DETS[w]) {
        afterDet = true; prevWasTo = false;
        emit(ordinalSet[w] ? '數詞（序數）' : '數詞（基數）',
             ordinalSet[w]
               ? '表示順序（第幾），前面通常加 the'
               : '表示數量；two 以上後面的可數名詞要用複數（one 則用單數）');
        return;
      }
      // ④ be 動詞（含縮寫 'm / 's / 're，顯示成 am / is / are 比較好懂）
      // 's 是所有格還是 be 動詞？要先在 BE 分支之前判斷，
      // 否則 "Jessie's grandparents" 的 's 會被 BE 分支吃掉。
      if (w === "'s") {
        var nx3 = toks[i + 1] ? toks[i + 1].toLowerCase() : '';
        var isNounNext = nx3 && !BE[nx3] && !MODALS[nx3] && !QW.test(nx3) &&
                         !VERBS[nx3] && verbBase(nx3) === null &&
                         !ADVERBS[nx3] && !/ly$/.test(nx3) &&
                         !/(ing|ed)$/.test(nx3) && !ADJECTIVES[nx3] && !COMPARATIVE[nx3] &&
                         // this / that / these / those / my / your 也是限定詞，
                         // 不收的話 "What's this?" 的 's 會被誤判成所有格
                         !DETS[nx3] && !DETS2[nx3] && !CARDINALS[nx3] &&
                         !PRONOUNS[nx3] && !PREPS[nx3] && !PARTICLES[nx3] &&
                         !CONJUNCTIONS[nx3];
        if (isNounNext) {
          prevWasBe = false; prevWasBeAt = -1; afterDet = true; prevWasTo = false;
          emit('所有格', '表示「…的」，後面的名詞是它所屬的人或物');
          return;
        }
      }
      if (BE[w] || w === "'m" || w === "'s" || w === "'re") {
        var showBe = w === "'m" ? 'am' : (w === "'s" ? 'is' : (w === "'re" ? 'are' : tok));
        // 不清 prevWasModal：be 動詞在 "will be opened" 裡是助動詞，
        // 後面 opened 才是主要動詞，旗標要留到那一步。
        sawVerb = true; afterDet = false; prevWasTo = false;
        prevWasBe = true; prevWasBeAt = i;
        emit('be 動詞', '表示身分或狀態，要跟主詞單複數一致', showBe);
        return;
      }
      // ⑤ 情態動詞
      if (MODALS[w]) {
        sawVerb = true; afterDet = false; prevWasTo = false; prevWasModal = true;
        emit('情態動詞', '後面一律接動詞原形，不加 to、不加 -s');
        return;
      }
      // ⑤-2 助動詞 do / does / did：「I don't want to go」的 want 是主要動詞，
      //  要靠這個旗標才認得出來。判斷方法：下一個 token 是不是 not / n't。
      if (w === 'do' || w === 'does' || w === 'did') {
        var nxtAux = toks[i + 1] ? toks[i + 1].toLowerCase() : '';
        var doIsAux = (nxtAux === 'not' || nxtAux === "n't");
        sawVerb = true; afterDet = false; prevWasTo = false;
        prevWasModal = doIsAux;
        emit(doIsAux ? '助動詞' : '動詞',
             doIsAux ? '和 not 一起構成否定句，後面接動詞原形' : '句子的主要動作，人稱和時態要正確');
        return;
      }
      // ⑤-3 Let：後面的字是動詞原形（Let's get / Let me know）
      if (w === 'let') {
        prevWasLet = true; afterDet = false; prevWasTo = false; sawVerb = true;
        emit('動詞', '祈使句開頭，後面接代名詞與動詞原形：Let us go / Let me know');
        return;
      }
      // ⑥ 否定詞
      if (w === 'not' || w === "n't" || w === 'never' || (w === 'no' && !DETS[w])) {
        // 不清 prevWasModal：won't go / don't like 的動詞在否定詞後面
        afterDet = false; prevWasTo = false;
        emit('否定詞', '放在 be 動詞或助動詞之後');
        return;
      }
      // ⑦ 疑問詞（when 要看句子是不是疑問句）
      // "What's this?" 的 When 是疑問詞；
      // "Turn on the lamp when you read." 的 when 是從屬連接詞。
      var isQuestionSent = /\?\s*$/.test(sent) || /^(who|what|where|when|why|how|which|whose|is|are|am|do|does|did|can|could|will|would|should|have|has)\b/i.test(sent.trim());
      if (QW.test(w) && !(w === 'when' && !isQuestionSent)) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        emit('疑問詞', '問「什麼／誰／哪裡／為什麼」，後面接主詞與動詞（不用倒裝）');
        return;
      }
      // ⑦-2 從屬連接詞（when / if / because ...）
      if (CONJUNCTIONS[w] || (w === 'when' && !isQuestionSent)) {
        if (SUBORD.test(w)) { sawVerb = false; }
        afterDet = false; prevWasTo = false; prevWasModal = false;
        prevWasConj = /^(and|or|but)$/.test(w);
        emit('連接詞', '把兩個詞或子句接起來');
        return;
      }
      // ⑧ 助動詞縮寫 've / 'll / 'd
      if (w === "'ve" || w === "'ll" || w === "'d") {
        var auxFn = w === "'ve" ? 'have + 過去分詞，構成現在完成式'
                   : w === "'ll" ? 'will 的縮寫，構成未來式'
                   : 'would 的縮寫，表示假設或過去習慣';
        sawVerb = true; afterDet = false; prevWasTo = false; prevWasModal = true;
        emit('助動詞', auxFn);
        return;
      }
      // ⑨ to：後面是動詞原形 → 不定詞標記
      if (w === 'to') {
        var nextTok = toks[i + 1] ? toks[i + 1].toLowerCase() : '';
        var nextIsVerb = nextTok && (BE[nextTok] || VERBS[nextTok] || verbBase(nextTok));
        if (nextIsVerb) {
          prevWasTo = true; afterDet = false; prevWasModal = false;
          emit('不定詞 to', 'to + 動詞原形，表示目的或想要做的事');
          return;
        }
        afterDet = true; prevWasModal = false;
        emit('介系詞', prepFn(w));
        return;
      }
      // ⑩ 片語動詞粒子：後面接名詞片語時是介系詞，否則是副詞
      if (PARTICLES[w]) {
        var nxt = toks[i + 1] ? toks[i + 1] : '';        var nxtLow = nxt.toLowerCase();
        var nxtIsPunct = nxt && /^[^\sA-Za-z0-9']$/.test(nxt);
        // 句中大寫開頭的專有名詞（on Thanksgiving / on TV / in Taiwan）→ 介系詞。
        // 句首的 In / It / The 這種不是專有名詞，要濾掉。
        var nxtIsProper = !!nxt && /^[A-Z]/.test(nxt) &&
          !/^(I|An|The|It|He|She|We|They|You|My|Your|His|Her|Its|Our|Their|This|That|These|Those|There|What|Who|Where|When|How|Why|Let|Don|Do|Does|Did|Is|Are|Am|Was|Were|Be|Can|Could|Will|Would|Should|Has|Have|Had|Mrs|Mr|Ms|Dr)$/.test(nxt);
        var nxtIsNounish = !!nxt && !nxtIsPunct && !nxtIsProper &&
          (DETS[nxtLow] || DETS2[nxtLow] || CARDINALS[nxtLow]);
        var collocationIsPrep = PREP_COLLOCATIONS[(w + ' ' + nxtLow).replace(/\s+$/, '')] === 1;
        if (nxtIsNounish || nxtIsProper || collocationIsPrep) {
          afterDet = true; prevWasTo = false; prevWasPrep = true;
        emit('介系詞', prepFn(w));
        } else {
          afterDet = false; prevWasTo = false; prevWasPrep = false;
          emit('副詞（粒子）', '和前面的動詞組成片語動詞，例如 stand up / go out');
        }
        return;
      }
      // ⑩-1 enough：形容詞後面是副詞（"not big enough"），名詞前面是限定詞（"enough money"）
      if (w === 'enough') {
        if (prevWasAdj) {
          afterDet = false; prevWasTo = false; prevWasModal = false;
          emit('副詞', '放在形容詞後面表示「夠…」，修飾前面的形容詞');
          return;
        }
        afterDet = true; prevWasTo = false;
        emit('限定詞', '放在名詞前表示「足夠的…」');
        return;
      }
      // ⑩-2 並列／全體限定詞
      if (DETS2[w] && !PRONOUNS[w]) {
        afterDet = true; prevWasTo = false;
        emit('限定詞', '放在名詞前，決定後面的名詞用單數還是複數');
        return;
      }
      // ⑪ 介系詞
      if (PREPS[w]) {
        afterDet = true; prevWasTo = false; prevWasModal = false; prevWasPrep = true;
        emit('介系詞', prepFn(w));
        return;
      }
      // ⑪ 限定詞／所有格
      if (DETS[w]) {
        afterDet = true; prevWasTo = false; prevWasModal = false;
        emit('限定詞', '放在名詞前，決定後面的名詞用單數還是複數');
        return;
      }
      // ⑬ 副詞
      // 但 be 動詞後面要優先當形容詞："The bus is late" 的 late 是形容詞，
      // "I get up late" 的 late 才是副詞。late / early / right 都算。
      if ((ADVERBS[w] || /ly$/.test(w)) &&
          !(prevWasBe && prevWasBeAt === i - 1 && CONTEXT_ADJ[w])) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        emit('副詞', '修飾動詞、形容詞或整句話，說明怎麼做或多麼');
        return;
      }
      // ⑬-2 形容詞後面接 enough：enough 是副詞（"not big enough"），不是限定詞
      if (w === 'enough' && prevWasAdj) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        emit('副詞', '放在形容詞後面表示「夠…」，修飾前面的形容詞');
        return;
      }
      // ⑭ 代名詞
      if (PRONOUNS[w]) {
        if (sawVerb && !afterDet) prevWasPronounObj = true;
        // "Let's get" 拆成 Let + 's，'s 走 be 動詞分支，
        // 但 get 仍是 Let 後面的動詞，所以要保留 prevWasLet。
        if (!prevWasLet) prevWasLet = false;
        sawSubject = true; afterDet = false; prevWasTo = false;
        prevWasModal = false; prevWasConj = false;
        emit('代名詞', pronounFn(w, sawVerb || afterDet));
        return;
      }
      // ⑮ 比較級／最高級（只用字表，不猜後綴）
      if (COMPARATIVE[w]) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        // -est / most 是最高級（三者以上），其餘是比較級（兩個）
        var isSuperlative = /est$/.test(w) || w === 'most' || w === 'best' || w === 'worst' ||
                            w === 'least' || w === 'furthest' || w === 'farthest';
        if (isSuperlative) {
          emit('形容詞（最高級）', '三者以上比出最怎麼樣的，前面通常加 the');
        } else {
          emit('形容詞（比較級）', '兩個東西比誰比較怎麼樣的，後面通常接 than');
        }
        prevWasAdj = true;
        return;
      }
      // ⑯-4 's 是所有格還是 be 動詞？
      // "Jessie's grandparents" → 所有格；"It's raining" → be 動詞。
      if (w === "'s") {
        var nxt2 = toks[i + 1] ? toks[i + 1].toLowerCase() : '';
        var looksLikeNoun = nxt2 && !BE[nxt2] && !MODALS[nxt2] && !QW.test(nxt2) &&
                            !VERBS[nxt2] && verbBase(nxt2) === null &&
                            !ADVERBS[nxt2] && !/ly$/.test(nxt2) &&
                            !/(ing|ed)$/.test(nxt2) && !ADJECTIVES[nxt2];
        if (looksLikeNoun) {
          prevWasBe = false; afterDet = true; prevWasTo = false;
          emit('所有格', '表示「…的」，後面的名詞是它所屬的人或物');
          return;
        }
      }
      // ⑯ 形容詞要排在 -ing 之前：interesting / exciting / boring 是
      // 分詞形容詞（Science is interesting），不是進行式動詞。
      if (ADJECTIVES[w]) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        emit('形容詞', '描述名詞的樣子、大小、顏色或感覺');
        prevWasAdj = true;
        return;
      }
      // ⑯-3 be 動詞 + 過去分詞（被動語態）：be born / was born / will be opened。
      // 只在 be 動詞「立刻接著」分詞時才判斷，
      // 且必須看得出是分詞形（結尾 -ed 或不規則過去分詞）。
      // 否則 "I'm glad" 的 glad 這類形容詞會被報成過去分詞。
      if (prevWasBe && prevWasBeAt === i - 1) {
        var wb = verbBase(w);
        var looksParticiple = (/ed$/.test(w) || IRREG_PAST[w]) && wb;
        if (looksParticiple) {
          prevWasBe = false; afterDet = false; prevWasTo = false;
          emit('動詞（過去分詞）', '搭配前面的 be 動詞構成被動語態：be born / was opened');
          return;
        }
        prevWasBe = false;
      }
      // 限定詞後面的名詞要排在 -ing 之前：
      // "The king lives" 的 king 結尾是 -ing 但是名詞；
      // "The bus is late" 的 bus 結尾是 -s 但是單數。
      if (afterDet) {
        var isPluralS = /s$/.test(w) && !isSingularS(w);
        var wasAfterPrep = prevWasPrep;
        var wasAfterBe = prevWasBe;   // be 後面的名詞是主詞補語，不要求緊鄰
        afterDet = false; prevWasTo = false; prevWasModal = false; prevWasConj = false;
        sawSubject = true; prevWasPronounObj = false; prevWasPrep = false;
        if (isPluralS) emit('名詞（複數）', nounFn(sawVerb, wasAfterPrep, wasAfterBe) + '，別漏掉 s');
        else emit('名詞', nounFn(sawVerb, wasAfterPrep, wasAfterBe));
        return;
      }
      // ⑯-2 現在分詞
      if (/ing$/.test(w)) {
        afterDet = false; prevWasTo = false; prevWasModal = false;
        emit('動詞（-ing）', '表示正在進行，前面搭配 be 動詞');
        sawVerb = true;
        return;
      }
      // ⑱ 動詞（含第三人稱、過去式等變化型）
      var vb = verbBase(w);
      var isVerbUse = vb !== null && (!sawVerb || prevWasTo || prevWasPronounObj || prevWasModal);
      if (isVerbUse) {
        sawVerb = true; prevWasTo = false; prevWasPronounObj = false; prevWasModal = false;
        prevWasConj = false; afterDet = false;
        if (w === vb) emit('動詞', '句子的主要動作，人稱和時態要正確');
        else emit('動詞', vb + ' 的變化型，注意人稱和時態');
        return;
      }
      // ⑳ 連接詞後面的第二個主詞（Mina and Mike）
      if (prevWasConj && !sawVerb) {
        prevWasConj = false; prevWasPronounObj = false;
        sawSubject = true;
        emit('名詞', '和前面的名詞一起當主詞，用複數動詞');
        return;
      }
      // ⑳-2 句中大寫開頭的專有名詞（Mr. Lin / Ted / Annie / Frank）。
      // 沒有這條的話 "Mr. Lin was so mad" 的 Lin 會被當成主要動詞。
      // 不用 !sawVerb 當條件："see Frank" 的 Frank 前面已經有動詞了，
      // 但 Frank 仍是專有名詞。
      if (i > 0 && /^[A-Z]/.test(tok) && !isFunctionWordMidSentence(tok)) {
        afterDet = false; prevWasConj = false; prevWasPronounObj = false;
        sawSubject = true;
        emit('名詞（專有名詞）', '人名、地名或特有名稱，第一個字母永遠大寫');
        return;
      }
      // ⑳-3 Let + 代名詞 + 動詞（Let's get / Let me know）
      // 不能用 !sawVerb 當條件：let 自己已經把 sawVerb 設成 true 了。
      if (prevWasLet) {
        // "Let's go get some lunch" 的 go、get 都是 bare infinitive，
        // 所以這裡只在「不是動詞」時才把旗標清掉，讓連續動作都能被認出來。
        if (verbBase(w)) {
          sawVerb = true; afterDet = false; prevWasPronounObj = false;
          emit('動詞', 'Let 後面的動作，用原形：Let us go / Let me know');
          return;
        }
        prevWasLet = false;
      }
      // ㉑ 句首第一個實詞
      // 但「句首 -s 字 + 第二個字是動詞」時，句首那個是複數主詞：
      //   "Leaves change colors in autumn." 的 Leaves 是葉子（複數名詞）
      //   "plants grow" 的 plants 是植物（複數名詞）
      // 排除第二個字是 -ing 的情況：「goes jogging」的 goes 才是動詞，
      // jogging 是動名詞補語。
      if (i === 0) {
        sawSubject = true; prevWasPronounObj = false; prevWasTo = false; prevWasModal = false;
        if (/s$/.test(w) && !isSingularS(w)) emit('名詞（複數）', '句首的主詞，複數名詞別漏掉 s');
        else emit('名詞', '句子的主詞');
        return;
      }
      // ㉒ 有主詞還沒動詞 → 主要動詞
      if (sawSubject && !sawVerb) {
        sawVerb = true; prevWasPronounObj = false; prevWasTo = false; prevWasModal = false;
        emit('動詞', '句子的主要動作，主詞是單數第三人稱時要加 -s');
        return;
      }
      // ㉓ 其餘：動詞後面多半是受詞名詞
      prevWasPronounObj = false; prevWasTo = false; prevWasModal = false; prevWasConj = false;
      var wasAfterPrep2 = prevWasPrep;
        var wasAfterBe = prevWasBe;   // be 後面的名詞是主詞補語，不要求緊鄰
      prevWasPrep = false;
      if (/s$/i.test(w) && !isSingularS(w)) emit('名詞（複數）', nounFn(sawVerb, wasAfterPrep2, wasAfterBe) + '，別漏掉 s');
      else emit('名詞', nounFn(sawVerb, wasAfterPrep2, wasAfterBe));
    });
    return rows;
  }

  function mistakes(sent, target) {
    var out = [];

    var be = sent.match(/\b(is|am|are|was|were)\b/i);
    if (be) {
      var w = be[1].toLowerCase();
      var swap = { 'is': 'are', 'am': 'is', 'are': 'is', 'was': 'were', 'were': 'was' }[w];
      out.push({
        title: '主詞和 be 動詞要一致',
        bad: '(X) ' + sent.replace(new RegExp('\\b' + be[1] + '\\b', 'i'), swap),
        ok: '(O) ' + sent,
        why: 'be 動詞看主詞決定單複數：I 用 am，you / we / they 用 are，he / she / it 單數用 is。中文沒有單複數變化，這題最容易忘。'
      });
    }

    var mo = sent.match(/\b(can|could|should|would|will|must|shall)\s+([A-Za-z']+)/i);
    if (mo) {
      var base = mo[2].replace(/s$/, '');
      out.push({
        title: '情態動詞後面接動詞原形',
        bad: '(X) ' + mo[1] + ' to ' + base,
        ok: '(O) ' + mo[1] + ' ' + base,
        why: 'can / could / should / would / will / must / shall 後面一律接動詞原形：不加 to、不加 -s、不加 -ing。'
      });
    }

    var of = sent.match(/\bof\s+([A-Za-z' -]+)/i);
    if (of) {
      var seg = of[1].trim();
      var nouns = seg.split(/\s+/).filter(function (x) {
        return !/^(the|a|an|my|your|his|her|their|our)$/i.test(x);
      });
      var plural = nouns.length && nouns.every(function (x) { return /s$/i.test(x); });
      if (plural) {
        out.push({
          title: 'of 後面的名詞複數容易漏掉 s',
          bad: '(X) ... of ' + seg.replace(/s\b/gi, '') + ' ...',
          ok: '(O) ... of ' + seg + ' ...',
          why: '前面的名詞是複數時，of 後面的可數名詞也要一起變複數，這是台灣學生最常漏掉的一個 s。'
        });
      }
    }

    if (!out.length) {
      var t = String(target || '');
      var here = t && sent.toLowerCase().indexOf(t.toLowerCase()) >= 0;
      out.push({
        title: '打完之後的三個自我檢查',
        bad: '(X) 打完就直接按下一個單元',
        ok: '(O) 重新從頭念一次，檢查 s、a / an / the、介系詞',
        why: (here
              ? '這一句裡有「' + t + '」，'
              : '這一句是「' + t + '」的練習，'
             ) + '打完之後把整句唸出來，比一個字一個字看更容易發現問題。' +
             '特別檢查三個地方：① 主詞和 be 動詞有沒有配對 ② 名詞該不該加 s ' +
             '③ 介系詞（in / on / at / of / for）放對了嗎。'
      });
    }
    return out;
  }

  // 這一步的出處：詞組來自對照表，單字／整句來自 PDF 的某一條
  function srcLabel(s) {
    if (s.src && /^\d-\d{3}$/.test(s.src)) return '來源 ' + s.src;
    if (s.kind === 'phrase') return '詞組對照表';
    return '延伸練習';
  }

  function openPanel() {
    var sc = curScenario(), u = curUnit(), s = curStep();
    if (!s) return;
    var h = '';

    // 執行資料檢核
    var validationIssues = validatePanelData();
    if (validationIssues.length > 0) {
      var errorCount = validationIssues.filter(function(i) { return i.level === 'error'; }).length;
      var warnCount = validationIssues.filter(function(i) { return i.level === 'warn'; }).length;
      h += '<section class="sec validation-section"><h3 class="sec__title">⚠ 資料檢核結果</h3>' +
        '<div class="card-box" style="border-color: ' + (errorCount ? '#e53e3e' : '#d69e2e') + '">' +
        '<div class="meta" style="margin-bottom:8px">發現 <b>' + errorCount + '</b> 個錯誤、<b>' + warnCount + '</b> 個警告' +
        '　·　場景：' + esc(sc.id) + '　·　單元：' + esc(u.id) + '　·　步驟：' + (state.stepIndex + 1) + '</div>' +
        '<ul class="validation-list">';
      validationIssues.forEach(function(issue) {
        var color = issue.level === 'error' ? '#e53e3e' : '#d69e2e';
        var label = issue.level === 'error' ? '❌ 錯誤' : '⚠ 警告';
        h += '<li style="border-left:3px solid ' + color + ';padding-left:8px;margin:6px 0;color:' + color + '">' +
          '<span class="mono" style="font-size:.8rem">[' + esc(issue.code) + ']</span> ' +
          esc(issue.msg) + ' <span class="meta">(' + esc(issue.step) + ')</span>' +
          '</li>';
      });
      h += '</ul></div></section>';
    }

    $('panelSub').textContent =
      sc.icon + ' ' + sc.title + ' · 單元 ' + (state.unitIndex + 1) +
      ' / ' + curUnits().length + ' · 第 ' + (state.stepIndex + 1) + ' / ' +
      u.steps.length + ' 步 · ' + u.level + ' 級';

    // 一、這一步在練什麼
    h += '<section class="sec"><h3 class="sec__title">一、這一步在練什麼</h3>' +
      '<div class="card-box">' +
      '<div class="big-en">' + esc(s.en) + '</div>' +
      '<div class="big-zh">' + esc(s.zh || '（無中文）') + '</div>' +
      (s.ipa ? '<div class="mono" style="color:var(--accent-2);margin-top:6px;font-size:.88rem">/' +
        esc(s.ipa) + '/</div>' : '') +
      '<div class="meta">類型：' + KIND_LABEL[s.kind] + '　·　目標單字：<b>' +
        esc(u.target) + '</b>（' + esc(u.gloss) + '）' +
        (u.ipa ? '　·　音標 <span class="mono">/' + esc(u.ipa) + '/</span>' : '') +
        '　·　這一條來源：' + esc(u.id) + '</div>' +
      '</div></section>';

    // 二、這個單元的四個層次（看得出循序漸進的關係）
    h += '<section class="sec"><h3 class="sec__title">二、這個單元怎麼循序漸進</h3>';
    u.steps.forEach(function (st, i) {
      var on = i === state.stepIndex;
      h += '<div class="card-box"' + (on ? ' style="border-color:var(--accent)"' : '') + '>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span class="badge ' + KIND_CLASS[st.kind] + '">' + KIND_LABEL[st.kind] + '</span>' +
        '<span class="meta" style="margin:0">' + (i + 1) + ' / ' + u.steps.length +
        (on ? '　·　目前在這一步' : '') + '</span></div>' +
        '<div class="big-en" style="font-size:.95rem">' + esc(st.en) + '</div>' +
        '<div class="big-zh">' + esc(st.zh) + '</div>' +
        (st.ipa ? '<div class="mono" style="color:var(--accent-2);margin-top:4px;' +
          'font-size:.8rem;opacity:.85">/' + esc(st.ipa) + '/</div>' : '') +
        '</div>';
    });
    h += '<div class="meta">這 ' + u.steps.length + ' 步的內容全部取自《英語單字口袋書》' + u.level +
      ' 級「' + esc(u.target) + '（' + esc(u.gloss) + '）」這一條。</div></section>';

    // 三、句型結構
    var rows = structure(s.en);
    h += '<section class="sec"><h3 class="sec__title">三、句子結構與詞性對照</h3>' +
      '<table class="pos"><thead><tr><th>單字</th><th>詞性</th><th>功能</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td class="tok">' + esc(r.tok) + '</td><td class="pos">' + esc(r.pos) +
        '</td><td class="fn">' + esc(r.fn) + '</td><td><span class="mark mark--' +
        (r.mark === 'X' ? 'x' : 'o') + '">(' + r.mark + ')</span></td></tr>';
    });
    h += '</tbody></table></section>';

    // 四、常犯錯誤
    h += '<section class="sec"><h3 class="sec__title">四、這一題最容易犯的錯</h3>';
    mistakes(s.en, u.target).forEach(function (m, i) {
      h += '<div class="mistake"><div class="mistake__t">錯誤類型 ' + (i + 1) + '：' +
        esc(m.title) + '</div>' +
        row('錯誤版本', '<span class="mark mark--x">(X)</span> ' + esc(m.bad.replace(/^\(X\)\s*/, ''))) +
        row('正確版本', '<span class="mark mark--o">(O)</span> ' + esc(m.ok.replace(/^\(O\)\s*/, ''))) +
        row('為什麼', esc(m.why)) +
        '</div>';
    });
    h += '</section>';

    // 五、108 課綱常見錯誤與修正技巧
    var curr = curriculum108(u, s);
    if (curr.length) {
      h += '<section class="sec"><h3 class="sec__title">五、108 課綱常見錯誤與修正技巧</h3>' +
        '<div class="meta" style="margin-bottom:8px">下面每一條都是台灣學生在會考／學測型題目上' +
        '最常犯的錯。先看 (X) 錯在哪，再看 (O) 怎麼改，最後的「理解技巧」是讓你自己檢查的方法。</div>';
      curr.forEach(function (m, i) {
        h += '<div class="mistake mistake--curr"><div class="mistake__t">' +
          '<span class="curr__tag">' + esc(m.tag) + '</span></div>' +
          row('錯誤版本', '<span class="mark mark--x">(X)</span> ' + esc(m.bad.replace(/^\(X\)\s*/, ''))) +
          row('正確版本', '<span class="mark mark--o">(O)</span> ' + esc(m.ok.replace(/^\(O\)\s*/, ''))) +
          row('為什麼', esc(m.why)) +
          row('理解技巧', '<span class="tip__v">' + esc(m.tip) + '</span>') +
          '</div>';
      });
      h += '</section>';
    }

    // 六、延伸範例句子
    var exs = exampleSentences(u);
    if (exs.length) {
      h += '<section class="sec"><h3 class="sec__title">六、延伸範例：把 <b>' +
        esc(u.target) + '</b> 放進更多句型</h3>' +
        '<div class="meta" style="margin-bottom:8px">會考不考「背過哪一句」，而是考「換一個句型還認不認得」。' +
        '比較每一句的差別，注意<b>紅色提示的那個地雷</b>。</div>';
      exs.forEach(function (e, i) {
        h += '<div class="card-box" style="margin-bottom:10px">' +
          '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">' +
          '<span class="meta" style="margin:0">例句 ' + (i + 1) + '</span>' +
          '<span class="big-en" style="font-size:.95rem">' + esc(e.en) + '</span></div>' +
          '<div class="big-zh" style="margin-top:2px">' + esc(e.zh) + '</div>' +
          '<div class="ex__trap">地雷提示：' + esc(e.trap) + '</div>' +
          '</div>';
      });
      h += '</section>';
    }

    // 七、練習建議
    h += '<section class="sec"><h3 class="sec__title">七、怎麼練才有效</h3><ul class="tips tips--num">' +
      '<li>同一個字錯到第 3 次時 App 會自動朗讀，這時<b>跟著唸</b>，注意每個字的音。</li>' +
      '<li>打完用 <kbd>Alt</kbd>+<kbd>H</kbd> 看答案，對照自己打的，差在哪個字母。</li>' +
      '<li>進度會自動存在這台裝置，隔天開啟直接從上次的地方接續。</li>' +
      '<li>錯超過 3 次的字會進「📕 錯字本」，那裡才是真正需要複習的。</li>' +
      '</ul></section>';

    $('panelBody').innerHTML = h;
    $('panel').hidden = false;
    $('scrim').hidden = false;
  }
  function row(k, v) {
    return '<div class="mistake__r"><span class="mistake__k">' + k +
      '</span><span class="mistake__v">' + v + '</span></div>';
  }
  function closePanel() { $('panel').hidden = true; $('scrim').hidden = true; }

  /* ------------------------------------------------------------ 事件 */
  function bind() {
    $('homeBtn').onclick = function () { closePanel(); showView('home'); renderHome(); };
    $('backBtn').onclick = function () { showView('home'); renderHome(); };
    $('prevUnitBtn').onclick = function () { gotoUnit(-1); };
    $('nextUnitBtn').onclick = function () { gotoUnit(1); };
    $('retryBtn').onclick = retryStep;
    $('speakBtn').onclick = function () { speak(curStep().en, 1); };
    $('peekBtn').onclick = peek;
    $('explainBtn').onclick = openPanel;
    $('panelClose').onclick = closePanel;
    $('scrim').onclick = closePanel;

    $('toggleZhBtn').onclick = function () {
      state.settings.hideZh = !state.settings.hideZh;
      $('promptZh').classList.toggle('hidden-hint', state.settings.hideZh);
      $('zhToggle').checked = state.settings.hideZh;
      saveAll();
    };

    $('browseBtn').onclick = openBrowse;
    $('closeBrowseBtn').onclick = function () { showView('home'); renderHome(); };
    $('searchInput').addEventListener('input', renderBrowse);
    $('mistakesBtn').onclick = function () { renderMistakes(); showView('mistakes'); };
    $('closeMistakesBtn').onclick = function () { showView('home'); renderHome(); };
    $('statsBtn').onclick = function () { renderStats(); showView('stats'); };
    $('closeStatsBtn').onclick = function () { showView('home'); renderHome(); };
    $('dataBtn').onclick = function () { showView('data'); syncSettings(); };
    $('closeDataBtn').onclick = function () { showView('home'); renderHome(); };

    $('repeatSelect').onchange = function () {
      state.settings.repeat = this.value; saveAll();
    };
    $('rateSelect').onchange = function () {
      state.settings.rate = parseFloat(this.value) || 0.85;
      saveAll();
      // 立刻用新語速唸一次，讓學生直接聽出差別
      var st = curStep();
      if (st && st.en) speak(st.en, 1);
    };
    $('zhToggle').onchange = function () {
      state.settings.hideZh = this.checked; saveAll(); renderPractice();
    };
    $('autoNextToggle').onchange = function () {
      state.settings.autoNext = this.checked; saveAll();
    };
    $('autoSpeakToggle').onchange = function () {
      state.settings.autoSpeak = this.checked; saveAll();
    };

    $('exportBtn').onclick = function () {
      var payload = JSON.stringify({
        progress: state.progress, mistakes: state.mistakes, settings: state.settings
      }, null, 1);
      $('dataArea').value = payload;
      $('dataArea').select();
      try { document.execCommand('copy'); toast('已複製並匯出'); }
      catch (e) { toast('已匯出到下方文字框'); }
    };
    $('importBtn').onclick = function () {
      try {
        var o = JSON.parse($('dataArea').value);
        if (o.progress) state.progress = o.progress;
        if (o.mistakes) state.mistakes = o.mistakes;
        if (o.settings) state.settings = Object.assign(state.settings, o.settings);
        saveAll(); syncSettings(); renderHome();
        toast('已匯入進度');
      } catch (e) { toast('匯入失敗：不是有效的 JSON'); }
    };
    $('resetBtn').onclick = function () {
      if (!confirm('確定清空全部練習進度與錯字本嗎？')) return;
      state.progress = {}; state.mistakes = {};
      saveAll(); renderHome(); toast('已清空');
    };

    document.addEventListener('keydown', function (e) {
      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(
        document.activeElement ? document.activeElement.tagName : '');

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        var k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); $('panel').hidden ? openPanel() : closePanel(); return; }
        if (k === 'n') { e.preventDefault(); gotoUnit(1); return; }
        if (k === 'p') { e.preventDefault(); gotoUnit(-1); return; }
        if (k === "'" || e.code === 'Quote') { e.preventDefault(); speak(curStep().en, 1); return; }
        if (k === 'h') { e.preventDefault(); peek(); return; }
        if (k === 'b') { e.preventDefault(); $('toggleZhBtn').click(); return; }
      }
      if (e.key === 'Escape') { closePanel(); return; }
      if (inField) return;
      if (e.key === 'ArrowRight') { gotoUnit(1); return; }
      if (e.key === 'ArrowLeft') { gotoUnit(-1); return; }
      // 面板開著時不要搶 Enter（面板是唯讀的，不需要反應）
      if (e.key === 'Enter' && state.view === 'practice' && $('panel').hidden) {
        e.preventDefault(); retryStep();
      }
    });
  }

  function syncSettings() {
    $('zhToggle').checked = state.settings.hideZh;
    $('autoNextToggle').checked = state.settings.autoNext;
    $('autoSpeakToggle').checked = state.settings.autoSpeak;
    $('repeatSelect').value = String(state.settings.repeat);
    // 語速：舊進度沒有這個鍵時用預設 0.85
    var r = parseFloat(state.settings.rate);
    $('rateSelect').value = String(isFinite(r) && r > 0 ? r : 0.85);
  }

  /* ------------------------------------------------------------ 啟動 */
  function boot() {
    buildWordIndex();
    try { state.progress = JSON.parse(readStore(STORE_PROGRESS, '{}')) || {}; } catch (e) {}
    try { state.mistakes = JSON.parse(readStore(STORE_MISTAKES, '{}')) || {}; } catch (e) {}
    try {
      var s = JSON.parse(readStore(STORE_SETTINGS, '{}'));
      Object.assign(state.settings, s || {});
    } catch (e) {}

    if ('speechSynthesis' in window) {
      speechSynthesis.onvoiceschanged = initVoices;
      initVoices();
    }
    bind();
    syncSettings();
    updateBadges();
    renderHome();

    // 網址可直接指定位置： index.html#food  或  index.html#food/12/3
    function applyHash() {
      var raw = decodeURIComponent(location.hash || '').replace(/^#/, '');
      if (!raw) return false;
      var parts = raw.split('/');
      // #查單字 / #browse → 直接開啟查單字畫面
      if (parts[0] === '查單字' || parts[0] === 'browse') {
        if (parts[1]) { $('searchInput').value = decodeURIComponent(parts[1]); }
        openBrowse();
        return true;
      }
      // #food/0/3/解析 → 直接開啟解析面板（沿用 wordmomo 的 #解析 用法）
      var wantPanel = parts.indexOf('解析') >= 0 || parts.indexOf('explain') >= 0;
      var sc = scenarioById(parts[0]);
      if (!sc) return false;
      state.scenarioId = sc.id;
      var us = unitsOf(sc);
      if (!us.length) return false;
      var ui = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      state.unitIndex = (ui >= 0 && ui < us.length) ? ui : 0;
      var steps = us[state.unitIndex].steps;
      var si = parts.length > 2 ? parseInt(parts[2], 10) : 0;
      state.stepIndex = (si >= 0 && si < steps.length) ? si : 0;
      showView('practice');
      renderPractice();
      if (wantPanel) openPanel();
      return true;
    }
    window.addEventListener('hashchange', function () { applyHash(); });

    if (applyHash()) return;

    // 沒指定場景時，接回上次練到的地方
    var lastSid = null;
    DATA.scenarios.forEach(function (s) {
      if (state.progress[s.id] && state.progress[s.id].cur) lastSid = s.id;
    });
    if (!lastSid) return;
    var lus = unitsOf(scenarioById(lastSid));
    if (!lus.length) return;
    var lp = state.progress[lastSid];
    state.scenarioId = lastSid;
    state.unitIndex = Math.min(lp.cur.unit || 0, lus.length - 1);
    state.stepIndex = Math.min(lp.cur.step || 0, lus[state.unitIndex].steps.length - 1);
    showView('practice');
    renderPractice();
    toast('已接續上次進度');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();