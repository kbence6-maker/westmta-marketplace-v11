const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
test('A cégtulajdonos minden látható elemben tulajdonosként jelenik meg',()=>{
  assert.ok(html.includes('Cégtulajdonosi <span>irányítópult</span>'));
  assert.ok(html.includes('Tulajdonosi jelszó'));
  assert.ok(html.includes('Cégtulajdonos</button>'));
  assert.ok(!/>\s*Admin(?:\s|<)/i.test(html));
  assert.ok(js.includes("admin:'CÉGTULAJDONOS'"));
});
test('Céges közvetítés szövege és hivatalos szabályzat link',()=>{
  assert.ok(html.includes('Céges közvetítés csak a cégtulajdonos jóváhagyása után'));
  assert.ok(html.includes('https://rules.westmta.com/server'));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
});
test('Az illusztráció helyett optimalizált autós hero fotó van',()=>{
  assert.ok(fs.statSync(path.join(root,'public/westrent-hero.webp')).size>100000);
  assert.ok(css.includes("url('/westrent-hero.webp')"));
  assert.ok(!html.includes('class="hero-graphic"'));
});
