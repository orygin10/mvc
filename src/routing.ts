function pathWithParents(routePath: string) {
  const paths = [];
  let path_parts = routePath.split("/");

  while (path_parts.length) {
    paths.unshift(path_parts.join("/"));
    path_parts.pop();
  }
  return paths;
}

function findClosestRelative(path: string) {
  let paths = path.split("/").filter(Boolean).slice(0, -1);
  let relative = document.getElementsByTagName('child').item(0);
  if (relative) return relative;
  while(paths.length) {
    let currentPath = ['', ...paths, "+layout.html"].join("/");
    paths.pop();
    let relative = document.querySelector(`[data-path="${currentPath}"] >* div[data-path]`)
    console.log(`Check '${currentPath}'`, relative);
    if (relative) return relative;
  }
  const itself = document.querySelector(`[data-path="${path}"]`)
  if (itself) return itself;
  relative = document.querySelector("div[data-path] >* div[data-path]");
  if (relative) return relative;
  relative = document.createElement('child');
  if (document.body.children.length > 0) {
    throw new Error("Cannot add child to non-empty body");
  }
  document.body.appendChild(relative);
  return relative;
}


const absentPaths: string[] = [];
async function fetchHtml(path: string) {
  if (absentPaths.includes(path)) {
    return null;
  }
  const response = await fetch(path);
  if (!response.ok) {
    absentPaths.push(path);
    return null;
  }
  const html = await response.text();
  const fragment = document.createRange().createContextualFragment(html);
  return fragment;
}

async function loadScript(path: string, params: { [key: string]: any }) {
  if (absentPaths.includes(path)) {
    return null;
  }
  const result = await fetch(path, { method: "HEAD" });
  if (!result.ok) {
    absentPaths.push(path);
    return null;
  }
  const module = await import(/* webpackIgnore: true */ window.location.origin + path)
  if (!module.default) {
    throw new Error(`No default export found in ${path}`);
  }
  await module.default({ params });
}

async function loadChild(path: string, force: boolean = false) {
  if (!force && document.querySelector(`[data-path="${path}"]`)) {
    return false;
  }
  const fragment = await fetchHtml(path);
  if (!fragment) {
    return false;
  }
  fragment.firstElementChild?.setAttribute('data-path', path);
  let oldChild = findClosestRelative(path);
  oldChild.replaceWith(fragment);
  return true;
}

const BASE_PATH = '/routes';
async function loadPage() {
  const hash = location.hash.slice(1) || "/";
  const paths = hash.split('/').filter(Boolean);
  const params: { [key: string]: any } = {};

  let currentPath = BASE_PATH;
  if (await loadChild(currentPath + "/+layout.html")) {
    await loadScript(currentPath + "/+layout.js", params);
  }
  while (paths.length) {
    const segment = paths.shift()!;
    if (segment.match(/^\d+$/)) {
      params.id = segment;
    }
    currentPath += `/${segment.replace(/^\d+$/, '[id]')}`;
    if (await loadChild(currentPath + "/+layout.html")) {
      await loadScript(currentPath + "/+layout.js", params);
    }
  }
  if (await loadChild(currentPath + "/+page.html", true)) {
    await loadScript(currentPath + "/+page.js", params);
  }
}

window.addEventListener("hashchange", loadPage);
window.addEventListener("DOMContentLoaded", loadPage);
