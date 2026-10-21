#!/usr/bin/env node
// 編集本文の定型的な留保が再発していないか検査する。
// 法律上の必要な留保・出典情報は別途編集レビューで判断する。
import fs from "node:fs";
import path from "node:path";

const sourceRoot = fs.existsSync("site/case.html") ? "site" : ".";
const exclusions = new Set([".git", ".github", "node_modules"]);
const banned = [
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

// 本文の事実ではなく、記事作成・調査の進め方を読者に説明する定型文。
const metaPatterns = [
  { label: "記事作成についての自己説明", re: /ここでは[^。\n<>]{0,140}(?:掲載|紹介|検証|整理|確認|取り上げ)(?:します|しています|していきます)/g },
  { label: "調査作業を読者に予告する文章", re: /ここでは[^。\n<>]{0,140}(?:先に掲載します|今後調べていきます)/g },
  { label: "根拠に代わる汎用的な留保", re: /この一件だけで[^。\n<>]{0,120}(?:判断|断定)できません/g },
];
const regressionSample = "ここでは確認できる宿直の男女区分を先に掲載します。";
if (!metaPatterns.some(({re}) => { re.lastIndex = 0; return re.test(regressionSample); })) {
  throw new Error("Editorial checker failed its regression example");
}
const editedPages = /(?:^|\/)(?:special\/[^/]+|index|gender-sentencing|statistics|debates|guides|topics|sentencing)\.html$/;

function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (exclusions.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...htmlFiles(file));
    else if (entry.isFile() && entry.name.endsWith(".html")) result.push(file);
  }
  return result;
}

const files = [...htmlFiles(sourceRoot), "scripts/refresh-sitemap.mjs"];
const findings = [];
let count = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  count++;
  const content = fs.readFileSync(file, "utf8");
  for (const phrase of banned) {
    if (content.includes(phrase)) findings.push({file,phrase});
  }
  if (editedPages.test(file.replaceAll("\\", "/"))) {
    const prose = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    for (const {label,re} of metaPatterns) {
      re.lastIndex = 0;
      for (const hit of prose.matchAll(re)) {
        findings.push({file,phrase: label + ": " + hit[0]});
      }
    }
  }
}
if (findings.length) {
  for (const {file,phrase} of findings) {
    console.error("[editorial-copy] "+file+" に定型的な留保があります: "+phrase);
  }
  process.exitCode = 1;
} else {
  console.log("[editorial-copy] "+count+"ファイル検査済み: 定型的な留保なし");
}
