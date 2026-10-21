#!/usr/bin/env node
// 裁判ウォッチの記事文体チェック。
// 事実関係に必要な留保は削除対象ではない。無意味な自己説明・作業説明だけを検出する。
import fs from "node:fs";
import path from "node:path";

const root = fs.existsSync("site/case.html") ? "site" : ".";
const skipDirs = new Set([".git", ".github", "node_modules"]);
const prohibited = [
  "個別事件だけで男女",
  "単純比較だけではその原因までは分かりません",
  "性別の因果効果を示す分析ではありません",
  "この集計だけから性別が量刑差の原因だとは判断できません",
  "投票結果は利用者の主観であり、裁判所の判断や事実認定を示すものではありません",
  "GOOD/BADは利用者の主観的な投票です。事実認定・信用性・法的評価を示すものではありません",
  "事実関係を事件情報として断定しません",
  "国籍だけで個人の犯罪可能性を判断することはできません",
  "性別そのものの効果を示すものではありません",
  "要約は原資料の代替ではありません。重要な内容はリンク先の原資料で確認してください",
  "ここでは確認できる宿直の男女区分を先に掲載します",
  "宿直以外の担当業務の配分については、職種・部署別の割当記録や規程を個別に調べる必要があります",
  "この一件だけで「女性だから不起訴になった」とは判断できません",
];

// 記事を生成する作業そのものを読者に語る定型表現。
// 抽象的な「ただし」「未確定」「推定」など、事実の正確さに必要な記載は禁止しない。
const rules = [
  ["編集工程の自己説明", /(?:ここでは|本(?:記事|ページ|特設|特集)では|当サイトでは|裁判ウォッチでは)[^。！？\n]{0,180}(?:掲載|紹介|説明|確認|検証|整理|取り上げ|調査)(?:します|しています|していきます)/g],
  ["調査作業の予告", /(?:今後|引き続き)[^。！？\n]{0,110}(?:資料を集め|調べ|確認し|検証し|調査し)[^。！？\n]{0,80}(?:ます|予定です|必要があります)/g],
  ["個別事件への定型的な免責", /この一件だけで[^。！？\n]{0,140}(?:断定できません|判断できません|示せません)/g],
  ["掲載順序の自己説明", /確認できる[^。！？\n]{0,90}先に掲載します/g],
];

function articleText(html) {
  // JavaScript・CSS・埋め込みデータを除外。読者が読む本文を対象にする。
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return (main ? main[1] : html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[ \t\r]+/g, " ")
    .replace(/ {2,}/g, " ");
}

function scan(text) {
  const hits = [];
  for (const [label, re] of rules) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) hits.push({label, sample: m[0]});
  }
  return hits;
}

function selfTest() {
  const bad = [
    "ここでは確認できる宿直の男女区分を先に掲載します。",
    "ここでは判決の内容を紹介します。",
    "本ページでは、関連事件を整理しています。",
    "裁判ウォッチでは、公開資料を検証していきます。",
    "今後も追加の資料を調べていきます。",
    "この一件だけで女性が優遇されているとは断定できません。",
    "<main><p>ここでは確認できた情報を</p><p>先に掲載します。</p></main>",
  ];
  const good = [
    "東京の当直規程には男性職員から宿直を命ずるとある。",
    "2026年10月に男女を問わない割当ての方針が報じられた。",
    "この統計は2024年に起訴された事件を対象とする。",
    "判決は2026年10月21日時点では確定していない。",
    "被告人の供述と客観的な証拠は一致しなかった。",
    "<script>ここでは調査結果を掲載します。</script><main>判決は無罪だった。</main>",
  ];
  for (const sample of bad) {
    if (!scan(articleText(sample)).length) throw new Error("見逃し: " + sample);
  }
  for (const sample of good) {
    if (scan(articleText(sample)).length) throw new Error("誤検出: " + sample);
  }
  if (!/(?:^|\/)(?:special\/[^/]+|guides\/[^/]+|index|gender-sentencing|statistics|debates|guides|topics|sentencing)\.html$/.test("site/special/judge-review.html")) {
    throw new Error("特設ページの選択条件が壊れています");
  }
  console.log("[editorial-copy] 再発防止テスト " + (bad.length + good.length + 1) + "件 OK");
}

function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (skipDirs.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(file));
    else if (entry.isFile() && entry.name.endsWith(".html")) found.push(file);
  }
  return found;
}

const editorialPage = /(?:^|\/)(?:special\/[^/]+|guides\/[^/]+|index|gender-sentencing|statistics|debates|guides|topics|sentencing)\.html$/;

selfTest();
if (process.argv.includes("--self-test")) process.exit(0);

const files = [...htmlFiles(root), "scripts/refresh-sitemap.mjs"];
const findings = [];
if (files.length < 2) throw new Error("HTMLの検査対象を読み込めません");
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  for (const phrase of prohibited) {
    if (html.includes(phrase)) findings.push({file, label: "定型的な留保", sample: phrase});
  }
  if (file.endsWith(".html") && editorialPage.test(file.replaceAll("\\", "/"))) {
    for (const hit of scan(articleText(html))) findings.push({file, ...hit});
  }
}
for (const {file, label, sample} of findings) {
  console.error("[editorial-copy] " + file + " | " + label + ": " + sample);
}
if (findings.length) {
  console.error("[editorial-copy] " + findings.length + "件検出。公開前に原稿を修正してください。");
  process.exitCode = 1;
} else {
  console.log("[editorial-copy] " + files.length + "ファイル検査済み。対象の定型文なし");
}
