/* playwright 를 어디에 설치했든 찾아옵니다.
 * 저장소에 node_modules 를 두지 않으므로 전역 설치본도 뒤집니다.
 */
module.exports = (function () {
  var tries = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (var i = 0; i < tries.length; i++) {
    try { return require(tries[i]); } catch (e) { /* 다음 후보 */ }
  }
  try {
    var root = require('child_process').execSync('npm root -g').toString().trim();
    return require(root + '/playwright');
  } catch (e) { /* 아래에서 안내합니다 */ }
  throw new Error('playwright 를 찾지 못했습니다. `npm i -g playwright` 후 다시 실행해 주세요.');
})();
