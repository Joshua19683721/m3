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
    settings: { hideZh: false, autoNext: true, autoSpeak: true, repeat: 3 }
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
    speechSynthesis.cancel();
    for (var i = 0; i < (times || 1); i++) {
      var u = new SpeechSynthesisUtterance(clean);
      if (voice) u.voice = voice;
      u.rate = 0.85;
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

  /* ------------------------------------------------------------ 解析面板 */
  var PREPS = { 'of': 1, 'in': 1, 'on': 1, 'at': 1, 'for': 1, 'from': 1, 'to': 1,
                'with': 1, 'by': 1, 'about': 1, 'into': 1, 'than': 1, 'after': 1,
                'before': 1, 'under': 1, 'over': 1, 'near': 1, 'behind': 1,
                'beside': 1, 'between': 1 };
  var MODALS = { 'can': 1, 'could': 1, 'should': 1, 'would': 1, 'will': 1,
                 'must': 1, 'may': 1, 'might': 1, 'shall': 1 };
  var BE = { 'is': 1, 'am': 1, 'are': 1, 'was': 1, 'were': 1, 'be': 1, 'been': 1, 'being': 1 };
  var DETS = { 'the': 1, 'a': 1, 'an': 1, 'my': 1, 'your': 1, 'his': 1, 'her': 1,
               'its': 1, 'their': 1, 'our': 1, 'this': 1, 'that': 1, 'these': 1,
               'those': 1, 'every': 1, 'some': 1, 'many': 1, 'no': 1 };
  var QW = /^(how|what|where|when|who|why|which|whose|whether)$/;

  function structure(sent) {
    var toks = sent.match(/[A-Za-z'’]+|[0-9]+|[^\sA-Za-z0-9']/g) || [];
    var rows = [], nouns = 0, verbs = 0, afterDet = false;
    toks.forEach(function (tok, i) {
      var w = tok.toLowerCase();
      if (/^[^\sA-Za-z0-9']$/.test(tok)) {
        afterDet = false;
        rows.push({ tok: tok, pos: '標點', fn: '決定句子怎麼斷氣，逗號後面用小寫開頭', mark: 'O' });
      } else if (BE[w]) {
        verbs++; afterDet = false;
        rows.push({ tok: tok, pos: 'be 動詞', fn: '表示身分或狀態，要跟主詞單複數一致', mark: 'O' });
      } else if (MODALS[w]) {
        verbs++; afterDet = false;
        rows.push({ tok: tok, pos: '情態動詞', fn: '後面一律接動詞原形，不加 to、不加 -s', mark: 'O' });
      } else if (PREPS[w]) {
        afterDet = true;   // 介系詞後面接名詞
        rows.push({ tok: tok, pos: '介系詞', fn: '後面接名詞或 -ing，不能接動詞原形', mark: 'O' });
      } else if (DETS[w]) {
        afterDet = true;   // 限定詞／所有格後面一定接名詞
        rows.push({ tok: tok, pos: '限定詞', fn: '放在名詞前，決定後面的名詞用單數還是複數', mark: 'O' });
      } else if (QW.test(w)) {
        afterDet = false;
        rows.push({ tok: tok, pos: '疑問詞', fn: '放在句首提問，後面用一般疑問句語序', mark: 'O' });
      } else if (w === 'and' || w === 'but' || w === 'or' || w === 'however' || w === 'because') {
        afterDet = false;
        rows.push({ tok: tok, pos: '連接詞', fn: '把兩個詞或子句接起來', mark: 'O' });
      } else if (w === 'not' || w === "don't" || w === "doesn't" || w === "didn't" || w === "can't") {
        afterDet = false;
        rows.push({ tok: tok, pos: '否定詞', fn: '放在 be 動詞或助動詞之後', mark: 'O' });
      } else if (/^\d+$/.test(w)) {
        afterDet = true;
        rows.push({ tok: tok, pos: '數詞', fn: 'two 以上後面的可數名詞要用複數', mark: 'O' });
      } else if (afterDet && /s$/i.test(w)) {
        // 限定詞/介系詞/數詞後面又以 s 結尾 → 是複數名詞，不是動詞。
        // 沒有這條的話 "All my classmates passed the test." 會把 classmates 判成動詞。
        nouns++; afterDet = false;
        rows.push({ tok: tok, pos: '名詞（複數）', fn: '前面的限定詞決定它要用複數，別漏掉 s', mark: 'O' });
      } else if (afterDet) {
        nouns++; afterDet = false;
        rows.push({ tok: tok, pos: '名詞', fn: '句中的名詞成分，依數量決定單複數', mark: 'O' });
      } else if (i === 0) {
        nouns++; rows.push({ tok: tok, pos: '名詞', fn: '句子的主詞', mark: 'O' });
      } else if (nouns >= 1 && verbs === 0) {
        verbs++; rows.push({ tok: tok, pos: '動詞', fn: '句子的主要動作', mark: 'O' });
      } else {
        nouns++; rows.push({ tok: tok, pos: '名詞', fn: '句中的名詞成分，依數量決定單複數', mark: 'O' });
      }
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

    // 五、練習建議
    h += '<section class="sec"><h3 class="sec__title">五、怎麼練才有效</h3><ul class="tips tips--num">' +
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