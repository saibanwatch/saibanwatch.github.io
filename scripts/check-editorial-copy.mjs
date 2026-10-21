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
];

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
}
if (findings.length) {
  for (const {file,phrase} of findings) {
    console.error("[editorial-copy] "+file+" に定型的な留保があります: "+phrase);
  }
  process.exitCode = 1;
} else {
  console.log("[editorial-copy] "+count+"ファイル検査済み: 定型的な留保なし");
}
