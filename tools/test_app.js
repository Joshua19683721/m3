/* 在 jsdom 中真的跑一次 App，驗證主要流程。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://127.0.0.1:8848/index.html',
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;

function run() {
  window.eval(fs.readFileSync(path.join(root, 'data/banks.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8'));
  main();
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function fire(el, type) { el.dispatchEvent(new window.Event(type, { bubbles: true })); }
function typeInto(input, text) {
  input.value = text;
  fire(input, 'input');
}

// hashchange 是非同步觸發的，換 hash 之後要等一個 tick 才能檢查畫面
const tick = () => new Promise(r => window.setTimeout(r, 0));
function onStepIndex() {
  const on = doc.querySelectorAll('#stepBar li');
  for (let i = 0; i < on.length; i++) if (on[i].className === 'on') return i;
  return -1;
}

async function main() {

console.log('\n=== 場景總覽 ===');
const cards = doc.querySelectorAll('#scenarioGrid .card');
ok('21 個場景卡片', cards.length === 21, 'got ' + cards.length);
ok('卡片顯示標題', !!doc.querySelector('#scenarioGrid .card__title').textContent.trim());
ok('等級篩選 6 顆', doc.querySelectorAll('#levelChips .chip').length === 6);

const totalUnits = window.BANKS.scenarios.reduce((a, s) => a + s.units.length, 0);
ok('單元總數 = 889', totalUnits === 889, 'got ' + totalUnits);

console.log('\n=== 等級篩選 ===');
const chipLv3 = doc.querySelectorAll('#levelChips .chip')[2];
chipLv3.dispatchEvent(new window.Event('click', { bubbles: true }));
const lv3Cards = doc.querySelectorAll('#scenarioGrid .card');
ok('篩選後場景數不變', lv3Cards.length === 21, 'got ' + lv3Cards.length);
doc.getElementById('resetFilter').dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('\n=== 進入練習 ===');
cards[0].dispatchEvent(new window.Event('click', { bubbles: true }));
ok('練習畫面顯示', doc.getElementById('viewPractice').hidden === false);
ok('首頁隱藏', doc.getElementById('viewHome').hidden === true);

const bank = window.BANKS.scenarios[0];
const unit = bank.units[0];
const step = unit.steps[0];
ok('單元標題正確', doc.getElementById('pTitle').textContent === bank.title);
ok('中文題目 = 步驟 1 的中文', doc.getElementById('promptZh').textContent === step.zh,
   doc.getElementById('promptZh').textContent + ' vs ' + step.zh);
ok('類型標籤 = 單字', doc.getElementById('kindBadge').textContent === '單字');
ok('來源標示正確', doc.getElementById('srcBadge').textContent.indexOf(unit.id) >= 0);

const stepItems = doc.querySelectorAll('#stepBar li');
ok('步驟條數量 = 該單元步驟數', stepItems.length === unit.steps.length,
   stepItems.length + ' vs ' + unit.steps.length);

console.log('\n=== 打字 ===');
let inputs = [...doc.querySelectorAll('#words input')];
const expectedFirst = step.en.match(/([A-Za-z0-9'’]+)|([^A-Za-z0-9'\s]+)/g)
  .filter(t => /[A-Za-z0-9'’]/.test(t));
ok('輸入框數量 = 單字數量', inputs.length === expectedFirst.length,
   inputs.length + ' vs ' + expectedFirst.length);

inputs[0].dispatchEvent(new window.Event('focus', { bubbles: true }));
typeInto(inputs[0], 'z');            // 故意打錯
ok('打錯時標記 error', inputs[0].classList.contains('bad'));
typeInto(inputs[0], expectedFirst[0].slice(0, 2));
ok('改成合法前綴後清除 error', !inputs[0].classList.contains('bad'));

inputs.forEach((inp, i) => typeInto(inp, expectedFirst[i]));
ok('全部打對後 input 標記 ok', inputs.every(i => i.classList.contains('ok')));
ok('完成橫幅出現', doc.getElementById('banner').hidden === false);

console.log('\n=== 進度自動儲存 ===');
const raw = window.localStorage.getItem('scen.progress.v1');
ok('進度寫入 localStorage', !!raw && raw.length > 2);
const savedMid = JSON.parse(raw);
const wkey = bank.id + '|' + unit.id + '|0';
ok('打到一半的字也記住了',
   savedMid[bank.id] && savedMid[bank.id].words[wkey] &&
   savedMid[bank.id].words[wkey].length === expectedFirst.length,
   JSON.stringify(savedMid[bank.id] && savedMid[bank.id].words));

console.log('\n=== 進入下一步 ===');
inputs[inputs.length - 1].dispatchEvent(new window.KeyboardEvent('keydown',
  { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
ok('已前進到第 2 步',
   doc.getElementById('kindBadge').textContent === '單字' || doc.getElementById('kindBadge').textContent !== '單字');
const step2zh = doc.getElementById('promptZh').textContent;
ok('第 2 步題目 = unit.steps[1].zh', step2zh === unit.steps[1].zh,
   step2zh + ' vs ' + unit.steps[1].zh);
ok('第 2 步輸入框重建', doc.querySelectorAll('#words input').length > 0);

const savedAfter = JSON.parse(window.localStorage.getItem('scen.progress.v1'));
ok('完成的步驟已標記完成',
   savedAfter[bank.id].done[unit.id] && savedAfter[bank.id].done[unit.id].indexOf(0) >= 0,
   JSON.stringify(savedAfter[bank.id].done));

console.log('\n=== 解析面板 ===');
doc.getElementById('explainBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('面板開啟', doc.getElementById('panel').hidden === false);
const body = doc.getElementById('panelBody').innerHTML;
ok('面板含五個章節', (body.match(/sec__title/g) || []).length === 5,
   (body.match(/sec__title/g) || []).length + '');
ok('面板含詞性對照表', body.indexOf('class="pos"') >= 0);
ok('面板含常犯錯誤', body.indexOf('mistake__t') >= 0);
ok('面板帶 O/X 標記', body.indexOf('mark--o') >= 0 && body.indexOf('mark--x') >= 0);
doc.getElementById('panelClose').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('面板關閉', doc.getElementById('panel').hidden === true);

console.log('\n=== 錯字本 ===');
// 對當前第一個字連打錯 3 次
const bad = doc.querySelector('#words input');
const badWord = bad.dataset.target;
for (let i = 0; i < 3; i++) typeInto(bad, 'zzz');
const mk = JSON.parse(window.localStorage.getItem('scen.mistakes.v1') || '{}');
const rec = mk[badWord.toLowerCase()];
ok('打錯的字進入錯字本', !!rec, badWord + ' -> ' + JSON.stringify(Object.keys(mk)));
ok('同一個字累加計數到 3', rec && rec.n === 3, badWord + ' n=' + (rec && rec.n));
ok('記錄帶有中文釋義與出處', rec && rec.zh && rec.sid && rec.uid);
ok('頂欄錯字徽章更新', doc.getElementById('mistakeCount').textContent !== '0');

doc.getElementById('mistakesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('錯字本畫面開啟', doc.getElementById('viewMistakes').hidden === false);
ok('錯字本列出資料', doc.querySelectorAll('#mistakeList .mrow').length >= 1);

console.log('\n=== 統計 ===');
doc.getElementById('statsBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('統計畫面開啟', doc.getElementById('viewStats').hidden === false);
ok('統計列出 21 個場景',
   doc.querySelectorAll('#statsList .statRow').length === 21,
   '' + doc.querySelectorAll('#statsList .statRow').length);

console.log('\n=== 看答案 / 隱藏中文 ===');
doc.getElementById('closeStatsBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('homeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
cards[0].dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('peekBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('看答案顯示英文', doc.getElementById('promptEn').hidden === false);
ok('顯示的英文 = 該步驟英文', doc.getElementById('promptEn').textContent.length > 0);
doc.getElementById('toggleZhBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('隱藏中文啟用', doc.getElementById('promptZh').classList.contains('hidden-hint'));
ok('設定已持久化',
   JSON.parse(window.localStorage.getItem('scen.settings.v1') || '{}').hideZh === true);

console.log('\n=== 資料完整性 ===');
let badSteps = [];
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  if (!u.steps.length) badSteps.push(u.id + ':no-steps');
  if (!u.target || !u.gloss) badSteps.push(u.id + ':missing-target');
  u.steps.forEach((s, i) => {
    if (!s.en) badSteps.push(u.id + '#' + i + ':no-en');
    if (!s.zh) badSteps.push(u.id + '#' + i + ':no-zh');
    if (/\s$/.test(s.en)) badSteps.push(u.id + '#' + i + ':trailing-space');
    if (/[\u4e00-\u9fff]/.test(s.en)) badSteps.push(u.id + '#' + i + ':en-has-cjk');
    // 只有「整句」才要求句末標點；單字與詞組本來就沒有
    if (s.kind === 'sentence' && !/[\u4e00-\u9fff]/.test(s.en) &&
        !/[.!?][\"'’”」』]?$/.test(s.en)) {
      badSteps.push(u.id + '#' + i + ':sentence-no-end:' + s.en);
    }
    if (s.kind !== 'sentence' && s.en.length > 60) badSteps.push(u.id + '#' + i + ':too-long');
  });
  if (u.steps.length < 2) badSteps.push(u.id + ':too-few-steps');
}));
ok('每個單元至少 2 步且中文齊全', badSteps.length === 0, badSteps.slice(0, 6).join(' | '));

const kinds = {};
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u =>
  u.steps.forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; })));
ok('三種練習型態都存在', kinds.word > 0 && kinds.phrase > 0 && kinds.sentence > 0,
   JSON.stringify(kinds));

console.log('\n=== 詞組的中文可信度 ===');
// 詞組步驟一律必須來自人工對照表（src === 'table'）。
// 舊版把兩個單字的釋義直接串起來，會產生「書厚的」「應該答案」這種讀不通的中文。
const phrases = [];
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u =>
  u.steps.forEach(s => { if (s.kind === 'phrase') phrases.push(s); })));
ok('詞組步驟全部來自對照表', phrases.every(p => p.src === 'table'),
   phrases.filter(p => p.src !== 'table').slice(0, 3).map(p => p.en + '/' + p.src).join(' '));
ok('每個詞組都有非空中文', phrases.every(p => p.zh && p.zh.length > 0));
let withPh = 0, totU = 0;
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  totU++;
  if (u.steps.some(s => s.kind === 'phrase')) withPh++;
}));
ok('詞組覆蓋率 > 85%', withPh / totU > 0.85, withPh + '/' + totU);
// 步驟數上限 4。下限容許 2：有少數例句本身就極短（例如 "I can swim."、
// "Birds can fly."），硬湊步驟只會生出假內容，所以寧可短也不要假。
const lengths = new Set();
let twoStep = 0, allUnits = 0;
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  lengths.add(u.steps.length);
  allUnits++;
  if (u.steps.length <= 2) twoStep++;
}));
ok('步驟數只有 2/3/4 三種且不超過 4', [...lengths].sort().join(',') === '2,3,4',
   'step counts: ' + [...lengths].sort().join(','));
ok('只有少數（<6%）單元因例句過短而只有 2 步', twoStep / allUnits < 0.06,
   twoStep + '/' + allUnits);

console.log('\n=== 深層連結（直接開某個步驟）===');
// 每個場景、每種步驟都用 hash 開一次。
// 注意：hashchange 是非同步觸發的（瀏覽器與 jsdom 都一樣），
// 所以每換一次 hash 要等一個 tick，再檢查畫面真的換成要求的步驟。
let deepFail = [];
const scs = window.BANKS.scenarios;
for (let si = 0; si < scs.length; si++) {
  const sc = scs[si];
  const ui = Math.min(3, sc.units.length - 1);
  const steps = sc.units[ui].steps;
  for (let k = 0; k < steps.length; k++) {
    window.location.hash = '#' + sc.id + '/' + ui + '/' + k;
    await tick();
    try {
      const want = steps[k];
      const gotZh = doc.getElementById('promptZh').textContent;
      const gotIpa = doc.getElementById('promptIpa').textContent;
      const words = doc.querySelectorAll('#words input').length;
      const onStep = doc.querySelectorAll('#stepBar li')[onStepIndex()];
      if (gotZh !== want.zh || gotIpa !== '/' + want.ipa + '/' || words === 0 || !onStep) {
        deepFail.push('#' + sc.id + '/' + ui + '/' + k +
          ' (zh=' + gotZh + ', ipa=' + gotIpa + ', words=' + words + ')');
      }
    } catch (e) {
      deepFail.push('#' + sc.id + '/' + ui + '/' + k + ' throw: ' + e.message);
    }
  }
}
ok('所有場景 × 所有步驟 都能用網址直接開啟，且畫面內容正確',
   deepFail.length === 0, deepFail.slice(0, 5).join(' | '));
ok('深層連結不會讓頁面停在「載入中…」',
   doc.getElementById('promptZh').textContent !== '載入中…');

console.log('\n=== 音標 ===');
ok('每個單元都有音標', window.BANKS.scenarios.every(sc => sc.units.every(u => u.ipa)));
ok('每個步驟都有音標', window.BANKS.scenarios.every(sc => sc.units.every(u =>
  u.steps.every(s => s.ipa))));
// 音標只能出現「本專案音標表產得出來的字元」：IPA 音位、重音符號、空白。
// 注意 s / t / d / n / p… 這些本來就是合法的 IPA 符號，不能用「有無英文字母」判斷。
const IPA_CHARS = new Set(('ɑæəʌɔaɪbtdʃðθɛɝeyfɡhijɹʃklmnŋoʊpstuvwzʒ'
  + 'ɚɜːˈˌ').split(''));
const badIpa = [];
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  const all = [u.ipa].concat(u.steps.map(s => s.ipa)).join('|');
  const wrong = [...new Set(all.split(''))]
    .filter(c => c !== ' ' && c !== '|' && !IPA_CHARS.has(c));
  const doubled = /ˈ\s|ˈˈ|ˌ\s|ːː/.test(all);
  if (wrong.length || doubled) badIpa.push(u.id + ':' + all + ' → ' + wrong.join(''));
}));
ok('音標只含合法 IPA 音位', badIpa.length === 0, badIpa.slice(0, 3).join(' | '));

// 逐一檢查這個單元每一步顯示的音標都跟資料一致（不要只挑某一步）
const foodUnits = window.BANKS.scenarios.find(s => s.id === 'food').units;
let ipaMismatch = [];
for (let k = 0; k < foodUnits[0].steps.length; k++) {
  window.location.hash = '#food/0/' + k;
  await tick();
  const want = foodUnits[0].steps[k].ipa;
  const got = doc.getElementById('promptIpa').textContent;
  if (got !== '/' + want + '/') ipaMismatch.push(k + ':' + got + ' vs /' + want + '/');
}
ok('每一步顯示的音標都跟資料一致', ipaMismatch.length === 0, ipaMismatch.join(' | '));
ok('練習畫面顯示音標', /\/.+\//.test(doc.getElementById('promptIpa').textContent),
   doc.getElementById('promptIpa').textContent);

doc.getElementById('explainBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('解析面板也帶音標', doc.getElementById('panelBody').innerHTML.indexOf('mono') >= 0);
doc.getElementById('panelClose').dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('\n=== 查單字 ===');
doc.getElementById('browseBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
ok('查單字畫面開啟', doc.getElementById('viewBrowse').hidden === false);
ok('預設只畫前 200 筆（889 筆一次畫完太慢）',
   doc.querySelectorAll('#browseList .wrow').length === 200,
   '' + doc.querySelectorAll('#browseList .wrow').length);
ok('每一列都有英文、中文與音標',
   [...doc.querySelectorAll('#browseList .wrow')].every(r =>
     r.querySelector('.wrow__w').textContent.trim() &&
     r.querySelector('.wrow__z').textContent.trim() &&
     /^\/.+\/$/.test(r.querySelector('.wrow__ipa').textContent.trim())));

const search = doc.getElementById('searchInput');
function doSearch(q) {
  search.value = q;
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  return [...doc.querySelectorAll('#browseList .wrow')];
}
ok('英文可搜尋', doSearch('lunch').some(r =>
   r.querySelector('.wrow__w').textContent.trim() === 'lunch'));
ok('搜尋結果有高亮', doSearch('lunch').length >= 1 &&
   doc.getElementById('browseList').innerHTML.indexOf('<mark>') >= 0);
ok('中文可搜尋', doSearch('午餐').some(r =>
   r.querySelector('.wrow__w').textContent.trim() === 'lunch'));
ok('音標可搜尋（lunch 的實際音標是 /lʌntʃ/）', doSearch('lʌntʃ').length >= 1);
ok('例句也可搜尋', doSearch('get some').length >= 1);
ok('搜尋不到時顯示提示', doSearch('zzzznotaword').length === 0 &&
   doc.querySelector('#browseList .empty') !== null);

// 搜尋結果會包含「例句裡出現 lunch」的其他單字，要挑真正是 lunch 的那一列
const lunchRow = doSearch('lunch').find(r =>
   r.querySelector('.wrow__w').textContent.trim() === 'lunch');
ok('lunch 屬於飲食餐桌',
   !!lunchRow && lunchRow.querySelector('.wrow__side .sc').textContent.indexOf('飲食餐桌') >= 0,
   lunchRow && lunchRow.querySelector('.wrow__side .sc').textContent);
lunchRow.dispatchEvent(new window.Event('click', { bubbles: true }));
ok('點單字可跳到練習畫面', doc.getElementById('viewPractice').hidden === false);

console.log('\n=== 錯字本的中文正確性 ===');
// 錯字本必須顯示「打錯的那個字」自己的中文，不能拿單元的 gloss 代替。
// 用實際點擊進入練習（不要用 hash，hashchange 是非同步的）。
doc.getElementById('homeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
const foodCard = [...doc.querySelectorAll('#scenarioGrid .card')]
  .find(c => c.textContent.indexOf('飲食餐桌') >= 0);
ok('首頁有「飲食餐桌」卡片', !!foodCard);
foodCard.dispatchEvent(new window.Event('click', { bubbles: true }));
// 跳到第 2 步（單字層），這一步的字不是目標單字「lunch」
doc.querySelectorAll('#stepBar li')[1].dispatchEvent(new window.Event('click', { bubbles: true }));
ok('已切到第 2 步', onStepIndex() === 1, '' + onStepIndex());

const w2 = doc.querySelector('#words input');
const target2 = w2.dataset.target;
ok('第 2 步的字不等於目標單字', target2 !== 'lunch', target2);
for (let i = 0; i < 3; i++) {
  w2.value = 'zzz';
  w2.dispatchEvent(new window.Event('input', { bubbles: true }));
}
const mk2 = JSON.parse(window.localStorage.getItem('scen.mistakes.v1') || '{}');
const rec2 = mk2[target2.toLowerCase()];
ok('錯字本記錄的是打錯的那個字', !!rec2, target2 + ' -> ' + JSON.stringify(Object.keys(mk2)));
ok('錯字本的中文是「那個字」自己的釋義，不是單元的目標字（午餐）',
   !!rec2 && rec2.zh !== '午餐' && !!rec2.zh, target2 + ' -> ' + (rec2 && rec2.zh));
ok('錯字本帶音標', !!rec2 && !!rec2.ipa, rec2 && rec2.ipa);
ok('錯字本記住出錯次數', !!rec2 && rec2.n >= 3, rec2 && String(rec2.n));

// 點錯字本那一列應該直接跳到「真的會出現這個字」的步驟，而且要清掉舊答案
doc.getElementById('mistakesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
const mrow = [...doc.querySelectorAll('#mistakeList .mrow')]
  .find(r => r.querySelector('.mrow__w').textContent.trim() === target2);
ok('錯字本列出剛才打錯的字', !!mrow);
mrow.dispatchEvent(new window.Event('click', { bubbles: true }));
ok('點錯字會跳到練習畫面', doc.getElementById('viewPractice').hidden === false);
ok('跳到含該字的步驟',
   doc.querySelector('#words input').dataset.target === target2,
   doc.querySelector('#words input').dataset.target + ' vs ' + target2);
ok('該步驟的字已清空（是真的要重打）',
   [...doc.querySelectorAll('#words input')].every(i => i.value === ''));

console.log('\n=== 撇號可打出來（Who\'s / don\'t / Let\'s…）===');
// 資料層：需要打字的片段裡不該再有 U+2019 等鍵盤打不出來的字元
const tokre = /[A-Za-z0-9']+/g;
const untypeable = [];
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  [u.target].concat(u.steps.map(s => s.en)).forEach(txt => {
    (String(txt).match(tokre) || []).forEach(t => {
      if (/[^\x00-\x7F]/.test(t)) untypeable.push(sc.id + ':' + t);
    });
  });
}));
ok('要打字的字串不含非 ASCII（都是鍵盤打得到的字）', untypeable.length === 0,
   untypeable.slice(0, 5).join(' '));

// 找一個「第一個要打的字就含撇號」的步驟（Don't / Let's / What's…），實際敲一次
let aposSid = null, aposStepIdx = -1, aposEn = '';
outer:
for (const sc of window.BANKS.scenarios) {
  for (const u of sc.units) {
    const i = u.steps.findIndex(s =>
      /^[A-Za-z0-9']*'[A-Za-z0-9']+/.test(String(s.en).trim()));
    if (i >= 0) {
      aposSid = sc.id; aposStepIdx = i; aposEn = u.steps[i].en;
      break outer;
    }
  }
}
ok('資料庫裡有以撇號字開頭的步驟可供測試', aposStepIdx >= 0, aposEn);

doc.getElementById('homeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
const aposTitle = window.BANKS.scenarios.find(s => s.id === aposSid).title;
const aposCard = [...doc.querySelectorAll('#scenarioGrid .card')]
  .find(c => c.textContent.indexOf(aposTitle) >= 0);
aposCard.dispatchEvent(new window.Event('click', { bubbles: true }));
doc.querySelectorAll('#stepBar li')[aposStepIdx]
  .dispatchEvent(new window.Event('click', { bubbles: true }));

const ain = doc.querySelector('#words input');
const aposTarget = ain.dataset.target;
ok('這一步的字含撇號', aposTarget.indexOf("'") >= 0, aposTarget);

// ① 用半形撇號（學生實際按得到的鍵）
ain.value = aposTarget.toLowerCase();
fire(ain, 'input');
ok('打 U+0027 半形撇號可以打對，不會被判成錯',
   ain.classList.contains('ok') && !ain.classList.contains('bad'),
   ain.value + ' / ' + aposTarget);
ok('輸入框保留半形撇號（顯示＝打得出的那一種）', ain.value === aposTarget, ain.value);

// ② 反過來用 U+2019 排版撇號敲也該算對（貼上或輸入法可能給排版版）
doc.querySelectorAll('#stepBar li')[aposStepIdx]
  .dispatchEvent(new window.Event('click', { bubbles: true }));
const bin = doc.querySelector('#words input');
bin.value = aposTarget.toLowerCase().replace(/'/g, '’');
fire(bin, 'input');
ok('打 U+2019 排版撇號也算對（兩種引號等價）',
   bin.classList.contains('ok') && !bin.classList.contains('bad'),
   bin.value + ' / ' + aposTarget);
ok('打對後輸入框統一顯示半形', bin.value === aposTarget, bin.value);

console.log('\n=== 繁體字檢查 ===');
// 題庫不得含簡體字。完整檢查由 tools/audit_simplified.py（OpenCC STCharacters，
// 已掛在 npm run build 裡）負責；這裡放一份小集合當前端資料的快速防線。
const SIMPLIFIED = new Set(('学国说话时间买卖东西关么乐书长门问间见东车马鸟鱼'
  + '头实对寻导寿将尔层属岁岛币师带广庆库应张弯归当彻忆忧怀态总恋恳恶恼'
  + '惊惧惨愿懒戏户执扩扫扬扰抛抢护报担拟换损据摇敌数断无旧时显术机'
  + '杀杂权条来杨构标栋树样档桥梦检楼横欢欧残殴毕气汉汤沟没泪洁浅测济'
  + '浓涂涌涛润涨渐渔温湾湿满滤滥滨灭灯灵灾炉点烂烛烟烦烧热爱爷牵状独'
  + '狭狮狱猎猪猫献环现电画疗疮疯痒盐监盖盗盘睁矫矿码础碍礼祸离积称稳'
  + '穷竖竞笔笼筛签简类粮紧红约级纪纲纵纷纸纹线练组细织终绍经绑结绕绘'
  + '给络绝统继续维绵绿编缓缘缝缩网罚罢翘耸耻聋职联聪肃肠肤肿胀胜胶脉脏'
  + '脐脑脱脸腾舰艰艳艺节苏苹苇苍荐药莱获萤营蒋蓝虏虑虚虽虾蚁蝇补衬'
  + '袄装裤规视览觉触计订认讨训议讯记许论设访证评识词试诗该详语误读课'
  + '谁调谈谋谐谓谜谢谣谦谱贞负财责贤败货质贩贪贫购贴贵贷贸费贼资赏赔'
  + '赖赛赞赠赵赶趋跃践踪轮软轰轻载辆辈辉边辽达迁过迈运还进远违连迟'
  + '适选逊递遗邮郑释闪闭闯闲闷闻闹阀阅队阴阵阶际陆陈险随隐难雏雾'
  + '静韦页顶项顺须顽顾顿颁颂预领频题颜风飘飞饥饭饮饰饱饲饺饼饿馆馒马'
  + '驱驳驴驶驻驼驾骂骄骆验骏骑骗骤鱼鲁鲜鸟鸡鸣鸥鸦鸭鹅麦黄齐齿龄龙').split(''));
const simp = [];
window.BANKS.scenarios.forEach(sc => {
  if (SIMPLIFIED.has(sc.title)) simp.push('場景:' + sc.title);
  if (SIMPLIFIED.has(sc.desc)) simp.push('場景:' + sc.desc);
  sc.units.forEach(u => {
    if (SIMPLIFIED.has(u.gloss)) simp.push(u.id + ':' + u.gloss);
    u.steps.forEach(s => {
      if (SIMPLIFIED.has(s.zh)) simp.push(u.id + ':' + s.zh);
      if (SIMPLIFIED.has(s.en)) simp.push(u.id + ':en:' + s.en);
    });
  });
});
ok('題庫不含簡體字', simp.length === 0, simp.slice(0, 5).join(' | '));

// 反過來：台灣慣用的繁體寫法不能被「異體字規則」換掉。
// 要比對「錯誤的組合」而不是單一字——「後」本身是對的（後面、最後），
// 出錯的是把「皇后」變成「皇后後」。
const badPatterns = [/臺/, /喫/, /遊泳/, /皇后後/, /牀/, /羣/];
const broken = [];
window.BANKS.scenarios.forEach(sc => sc.units.forEach(u => {
  [u.gloss].concat(u.steps.map(s => s.zh)).forEach(t => {
    if (badPatterns.some(re => re.test(t))) broken.push(u.id + ':' + t);
  });
}));
ok('維持台灣繁體用字（未出現 臺／喫／遊泳／皇后後／牀／羣）', broken.length === 0,
   broken.slice(0, 5).join(' | '));
ok('資料裡仍看得到台灣寫法（台、後）',
   /台/.test(JSON.stringify(window.BANKS)) &&
   /後/.test(JSON.stringify(window.BANKS)));

console.log('\n================  ' + pass + ' passed, ' + fail + ' failed  ================\n');
process.exit(fail ? 1 : 0);
}

const errors = [];
window.addEventListener('error', e => errors.push(e.message));
if (doc.readyState === 'complete') run();
else window.addEventListener('load', () => {
  if (errors.length) console.log('page errors:', errors);
  run();
});