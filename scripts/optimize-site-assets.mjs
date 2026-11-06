// Build-only: keep token/cascade semantics while publishing only reachable assets.
import {readFile, writeFile, mkdir, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function optimizeSiteAssets(dist, htmlFiles) {
  const retained = new Set();
  const emitted = new Map();
  const external = value => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
  function local(value, from) {
    const pathname = value.split(/[?#]/)[0];
    const relative = path.posix.normalize(pathname.startsWith('/') ? pathname.slice(1) : path.posix.join(path.posix.dirname(from), pathname));
    if (relative === '..' || relative.startsWith('../')) throw Error('Asset escapes site: ' + value);
    return relative;
  }
  async function emit(bytes, extension) {
    const name = `assets/site.${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    await mkdir(path.join(dist, 'assets'), {recursive:true});
    if (!retained.has(name)) await writeFile(path.join(dist, name), bytes);
    retained.add(name);
    return '/' + name;
  }
  async function asset(relative) {
    if (!emitted.has(relative)) emitted.set(relative, await emit(await readFile(path.join(dist, relative)), path.posix.extname(relative).slice(1)));
    return emitted.get(relative);
  }
  async function css(relative, ancestors = []) {
    if (ancestors.includes(relative)) throw Error('Circular CSS import: ' + relative);
    let source = await readFile(path.join(dist, relative), 'utf8');
    let result = '', last = 0;
    const imports = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g;
    for (const match of source.matchAll(imports)) {
      result += await rebase(source.slice(last, match.index), relative);
      if (external(match[1])) throw Error('External CSS import: ' + match[1]);
      result += await css(local(match[1], relative), [...ancestors, relative]);
      last = match.index + match[0].length;
    }
    result += await rebase(source.slice(last), relative);
    if (/@import\b/.test(result)) throw Error('Unsupported CSS import in ' + relative);
    return result;
  }
  async function rebase(source, relative) {
    let result = '', last = 0;
    for (const match of source.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
      result += source.slice(last, match.index);
      const value = match[2].trim();
      result += external(value) ? match[0] : `url("${await asset(local(value, relative))}")`;
      last = match.index + match[0].length;
    }
    return result + source.slice(last);
  }
  const summary = {pages:0, cssBundles:0, deferredImages:0};
  for (const relative of htmlFiles) {
    let html = await readFile(path.join(dist, relative), 'utf8');
    // One stylesheet per page, including any legacy duplicate links in cascade order.
    const sheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/g)];
    let combined = '';
    for (const match of sheets) {
      if (match[0].startsWith('<style')) {
        if (/^<style\b[^>]*\bmedia=/.test(match[0])) throw Error('Unsupported inline media in ' + relative);
        combined += await rebase(match[0].replace(/^<style\b[^>]*>/, '').replace(/<\/style>$/, ''), relative);
        continue;
      }
      const href = match[0].match(/\bhref=["']([^"']+)["']/)?.[1];
      if (!href || external(href) || /\bmedia=/.test(match[0])) throw Error('Unsupported stylesheet in ' + relative);
      combined += await css(local(href, relative));
    }
    if (sheets.length) {
      const href = await emit(Buffer.from(combined), 'css');
      for (let index = 0; index < sheets.length; index++) html = html.replace(sheets[index][0], index ? '' : `<link rel="stylesheet" href="${href}">`);
      summary.cssBundles++;
    }
    // Immutable URLs apply only to build-owned JS; runtime endpoint config stays no-store.
    for (const match of [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]) {
      if (external(match[1])) continue;
      const source = local(match[1], relative);
      if (source === 'scripts/runtime-config.js') { retained.add(source); continue; }
      html = html.replace(match[0], match[0].replace(match[1], await asset(source)));
    }
    // Native lazy loading can fetch several screens ahead; product screenshots wait for viewport proximity.
    html = html.replace(/<img\b[^>]*\bloading="lazy"[^>]*>/g, tag => {
      const src = tag.match(/\bsrc="([^"]+)"/);
      if (!src) return tag;
      summary.deferredImages++;
      return tag.replace(src[0], `data-site-src="${src[1]}"`) + `<noscript>${tag}</noscript>`;
    });
    for (const match of [...html.matchAll(/<img\b[^>]*>/g)]) {
      const src = match[0].match(/\b(?:src|data-site-src)="([^"]+)"/);
      if (!src || external(src[1])) continue;
      const published = await asset(local(src[1], relative));
      html = html.replace(match[0], match[0].replace(src[1], published));
    }
    // Keep public image/icon links and their exact branded bytes; omit unreferenced copies.
    for (const match of html.matchAll(/\b(?:src|href|poster|content|data-site-src)=["']([^"']+)["']/g)) {
      if (external(match[1])) continue;
      const target = local(match[1], relative);
      if (/^(?:images|assets)\//.test(target)) retained.add(target);
    }
    // Inline style backgrounds are rare legacy consumers; preserve their referenced local assets.
    for (const match of html.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (!external(match[1])) retained.add(local(match[1], relative));
    }
    await writeFile(path.join(dist, relative), html);
    summary.pages++;
  }
  async function prune(directory, prefix) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const relative = prefix + '/' + entry.name;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await prune(full, relative);
      else if (!retained.has(relative)) await rm(full);
    }
  }
  for (const directory of ['images', 'styles', 'scripts']) await prune(path.join(dist, directory), directory);
  return summary;
}
