#!/usr/bin/env tsx
/**
 * 自动向 docs.html 添加新版本记录条目。
 *
 * 用法:
 *   npx tsx scripts/add-changelog.ts --build 28 --changes "新增 XX 功能" --sub "细节1" "细节2" --changes "修复 YY 问题"
 *
 * 也可通过 npm script 调用:
 *   npm run changelog -- --build 28 --changes "变更1" --sub "子项a" "子项b" --changes "变更2"
 *
 * 选项:
 *   --build, -b     构建号 (如 28)，必须
 *   --date, -d      日期 (YYYY-MM-DD)，默认今天
 *   --tags, -t      标签列表，逗号分隔 (feat,fix,improve,docs)，默认 feat
 *   --changes, -c   变更条目（每个 --changes 为一条一级条目）
 *   --sub, -s       紧跟在 --changes 后的二级子条目
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DOCS_PATH = resolve(import.meta.dirname, '..', 'public', 'docs.html');

interface ChangeItem {
  text: string;
  subs: string[];
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let build = '';
  let date = new Date().toISOString().slice(0, 10);
  let tags: string[] = ['feat'];
  const changes: ChangeItem[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--build' || arg === '-b') {
      build = args[++i];
    } else if (arg === '--date' || arg === '-d') {
      date = args[++i];
    } else if (arg === '--tags' || arg === '-t') {
      tags = args[++i].split(',').map(t => t.trim());
    } else if (arg === '--changes' || arg === '-c') {
      i++;
      const text = args[i];
      const subs: string[] = [];
      // Look ahead for --sub items
      while (i + 1 < args.length && (args[i + 1] === '--sub' || args[i + 1] === '-s')) {
        i += 2; // skip --sub flag
        // collect all non-flag arguments as sub-items
        while (i < args.length && !args[i].startsWith('-')) {
          subs.push(args[i]);
          i++;
        }
        i--; // back one step since outer loop will i++
        break;
      }
      changes.push({ text, subs });
    }
    i++;
  }

  if (!build) {
    console.error('错误: 请提供 --build 参数，例如: --build 28');
    process.exit(1);
  }
  if (changes.length === 0) {
    console.error('错误: 请提供 --changes 参数，例如: --changes "新增XX功能"');
    process.exit(1);
  }

  return { build, date, tags, changes };
}

const TAG_MAP: Record<string, string> = {
  feat: 'NEW',
  fix: 'FIX',
  improve: 'IMPROVE',
  docs: 'DOCS',
};

function buildEntry(build: string, date: string, tags: string[], changes: ChangeItem[]): string {
  const tagHtml = tags
    .map(t => `      <span class="changelog-tag ${t}">${TAG_MAP[t] || t.toUpperCase()}</span>`)
    .join('\n');

  const listHtml = changes
    .map(c => {
      if (c.subs.length === 0) {
        return `      <li>${c.text}</li>`;
      }
      const subItems = c.subs.map(s => `          <li>${s}</li>`).join('\n');
      return `      <li>${c.text}\n        <ul>\n${subItems}\n        </ul>\n      </li>`;
    })
    .join('\n');

  return `  <div class="changelog-entry latest">
    <div class="changelog-version">
      <span class="ver">v0.1 · Build ${build}</span>
      <span class="date">${date}</span>
      <span class="badge-latest">LATEST</span>
    </div>
    <div class="changelog-tags">
${tagHtml}
    </div>
    <ul class="changelog-list">
${listHtml}
    </ul>
  </div>`;
}

function main() {
  const { build, date, tags, changes } = parseArgs(process.argv);

  let html = readFileSync(DOCS_PATH, 'utf-8');

  // Remove "latest" class and badge from previous latest entry
  html = html.replace(
    /(<div class="changelog-entry) latest(")/g,
    '$1$2'
  );
  html = html.replace(
    /\s*<span class="badge-latest">LATEST<\/span>/g,
    ''
  );

  // Build new entry
  const newEntry = buildEntry(build, date, tags, changes);

  // Insert after the <p class="lead"> in the changelog section
  const marker = '版本记录</h1>\n  <p class="lead">';
  const leadEnd = '</p>';
  const insertPoint = html.indexOf(marker);
  if (insertPoint === -1) {
    console.error('错误: 在 docs.html 中未找到版本记录章节标记');
    process.exit(1);
  }

  // Find the end of the <p class="lead">...</p> after the marker
  const afterMarker = html.indexOf(leadEnd, insertPoint + marker.length);
  if (afterMarker === -1) {
    console.error('错误: 无法定位插入点');
    process.exit(1);
  }
  const insertIdx = afterMarker + leadEnd.length;

  html = html.slice(0, insertIdx) + '\n\n' + newEntry + '\n' + html.slice(insertIdx);

  writeFileSync(DOCS_PATH, html, 'utf-8');

  console.log(`✓ 已添加 v0.1 · Build ${build} 版本记录到 docs.html`);
}

main();
