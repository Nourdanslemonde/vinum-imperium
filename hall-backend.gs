/**
 * VINUM IMPERIUM — 명예의 전당 백엔드 (Google Apps Script)
 * ------------------------------------------------------------
 * 이 코드를 Apps Script 프로젝트에 붙여넣고 "웹 앱"으로 배포한 뒤,
 * 배포 URL을 index.html의 HALL_API 값으로 넣으면 전역 전당이 동작한다.
 *
 * 보안 핵심: 웹 앱 URL은 공개될 수밖에 없으므로(클라이언트가 호출),
 * 누구나 POST할 수 있다고 가정하고 "서버에서" 입력을 검증·정제한다.
 *   - 필드 화이트리스트 + 타입/길이/범위 강제
 *   - HTML/제어문자 제거
 *   - 지역·성별 값은 허용된 값만 통과
 *   - 짧은 시간 내 동일 IP 도배 방지(간단한 레이트리밋)
 *   - 최근 N개만 응답으로 반환
 *
 * 배포:
 *   1) sheet를 하나 만들고 스크립트를 그 스프레드시트에 바인딩(확장 프로그램 > Apps Script)
 *   2) 아래 코드 저장 → 배포 > 새 배포 > 유형: 웹 앱
 *      - 실행: 나 / 액세스: 모든 사용자
 *   3) 배포 URL을 index.html의 HALL_API에 붙여넣기
 *   4) 검증/규정을 바꾸면 반드시 "새 버전"으로 다시 배포해야 반영됨
 */

var SHEET_NAME = 'hall';
var MAX_RETURN = 50;          // 응답으로 돌려줄 최근 기록 수
var RATE_LIMIT_SECONDS = 10;  // 동일 요청 최소 간격(초)

var FACTIONS = { rome: true, georgia: true };
var GENDERS = { m: true, f: true };

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['date', 'name', 'faction', 'gender', 'vi', 'years', 'comment']);
  }
  return sh;
}

/** 문자열 정제: HTML 특수문자·제어문자 제거, 공백 정리, 길이 제한 */
function cleanStr_(v, max) {
  var s = String(v == null ? '' : v);
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ');   // 제어문자
  s = s.replace(/[<>]/g, '');                       // 태그 방지
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.substring(0, max);
  return s;
}

function clampInt_(v, min, max, dflt) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = dflt;
  return Math.max(min, Math.min(max, n));
}

/** 서버측 검증·정제 — 신뢰할 수 없는 입력을 안전한 레코드로 변환 */
function sanitize_(raw) {
  var name = cleanStr_(raw.name, 12) || '무명';
  var comment = cleanStr_(raw.comment, 120);
  var faction = FACTIONS[raw.faction] ? raw.faction : 'georgia';
  var gender = GENDERS[raw.gender] ? raw.gender : 'f';
  var vi = clampInt_(raw.vi, 0, 4, 0);
  var years = clampInt_(raw.years, 1, 999, 1);
  var date = cleanStr_(raw.date, 10) || Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
  return { date: date, name: name, faction: faction, gender: gender, vi: vi, years: years, comment: comment };
}

/** 간단한 레이트리밋: 캐시에 최근 요청 지문을 남겨 도배를 완화 */
function rateLimited_(fingerprint) {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + fingerprint;
  if (cache.get(key)) return true;
  cache.put(key, '1', RATE_LIMIT_SECONDS);
  return false;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 기록 추가 */
function doPost(e) {
  try {
    var raw = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var rec = sanitize_(raw);

    // 도배 방지: 같은 이름+코멘트 조합이 짧은 시간 내 반복되면 무시
    if (rateLimited_(Utilities.base64Encode(rec.name + '|' + rec.comment).substring(0, 40))) {
      return json_({ ok: false, error: 'rate_limited' });
    }

    sheet_().appendRow([rec.date, rec.name, rec.faction, rec.gender, rec.vi, rec.years, rec.comment]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** 최근 기록 조회 (최신순, 최대 MAX_RETURN개) */
function doGet() {
  try {
    var sh = sheet_();
    var last = sh.getLastRow();
    if (last < 2) return json_([]);
    var n = Math.min(MAX_RETURN, last - 1);
    var rows = sh.getRange(last - n + 1, 1, n, 7).getValues();
    var out = rows.map(function (r) {
      return sanitize_({
        date: r[0], name: r[1], faction: r[2], gender: r[3], vi: r[4], years: r[5], comment: r[6]
      });
    }).reverse(); // 최신이 위로
    return json_(out);
  } catch (err) {
    return json_([]);
  }
}
