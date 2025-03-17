const PLUS = location.hostname === "localhost" ? "+" : "%2B";

function resolveRoute(hash: string) {
  const parts = hash.split("/").filter(Boolean);

  let folder = "/routes";
  let subPath = "";
  let params: Record<string, string | number> = {};

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    if (!isNaN(Number(segment))) {
      subPath += `/[id]`;
      params["id"] = +segment;
      continue;
    }
    subPath += `/${segment}`;
  }
  return {
    routePath: `${folder}${subPath}`,
    params,
  };
}

function pathWithParents(routePath: string) {
  const paths = [];
  let path_parts = routePath.split("/");

  while (path_parts.length) {
    paths.unshift(path_parts.join("/"));
    path_parts.pop();
  }
  return paths;
}

async function loadLayout(routePath: string) {
  const paths = pathWithParents(routePath);
  let bodyLoaded = false;
  for (let i = 0; i < paths.length; i++) {
    const layoutHtml = `${paths[i]}/${PLUS}layout.html`;
    const response = await fetch(layoutHtml);
    if (!response.ok) {
      console.debug(`[ROUTING] Layout not found: ${layoutHtml}`);
      continue;
    }
    const text = await response.text();
    const html =
      `<!-- BEGIN ${layoutHtml} -->` + text + `<!-- END ${layoutHtml} -->`;
    if (!bodyLoaded) {
      document.body.innerHTML = html;
      bodyLoaded = true;
    } else {
      const childElement = document.querySelector("child");
      if (!childElement) {
        console.error("[ROUTING] Child element not found");
        continue;
      }
      childElement.outerHTML = html;
    }
    await loadLayoutScript(paths[i]);
    console.debug("[ROUTING] Loaded layout:", layoutHtml);
  }
  return bodyLoaded;
}

/**
 *
 * @param {string} routePath
 * @param {{[key: string]: string|number}} params
 * @param {Object} options
 * @param {boolean} options.layoutLoaded
 */
async function loadPageContent(
  routePath: string,
  params: Record<string, string | number>,
  { layoutLoaded }: { layoutLoaded: boolean },
) {
  const pageHtml = `${routePath}/${PLUS}page.html`;
  let pageContent = await (await fetch(pageHtml)).text();
  pageContent = pageContent.replace(
    /\[(\w+)\]/g,
    (_, key) => `${params[key] || ""}`,
  );
  pageContent =
    `<!-- BEGIN ${pageHtml} -->` + pageContent + `<!-- END ${pageHtml} -->`;
  if (layoutLoaded) {
    document.querySelector("child")!.outerHTML = pageContent;
  } else {
    document.body.innerHTML = pageContent;
  }
  console.debug("[ROUTING] Loaded page content:", pageHtml);
}

async function loadPageScript(
  routePath: string,
  params: Record<string, string | number>,
) {
  const pageJs = `${routePath}/${PLUS}page.js`;
  if (!(await fetch(pageJs, { method: "HEAD" }).then((r) => r.ok))) {
    console.debug("[ROUTING] Page script not found:", pageJs);
    return;
  }
  const mod = await import(/* webpackIgnore: true */ pageJs).catch(
    console.warn,
  );
  if (!mod) {
    console.debug("[ROUTING] Page script not found:", pageJs);
    return;
  }
  if (typeof mod.default === "function") {
    await mod.default({ params });
  } else {
    console.warn("[ROUTING] No default export found in page script:", pageJs);
  }
}

async function loadLayoutScript(routePath: string) {
  const layoutJs = `${routePath}/${PLUS}layout.js`;
  const mod = await import(/* webpackIgnore: true */ layoutJs).catch(
    console.warn,
  );
  if (!mod) {
    console.debug("[ROUTING] Layout script not found:", layoutJs);
    return;
  }
  if (typeof mod.default === "function") {
    await mod.default();
  } else {
    console.warn(
      "[ROUTING] No default export found in layout script:",
      layoutJs,
    );
  }
}

async function loadPage() {
  // document.body.setAttribute("style", "display: none;");
  const hash = location.hash.slice(1) || "/";
  const { routePath, params } = resolveRoute(hash);
  console.debug("[ROUTING] Loading route:", routePath);

  const layoutLoaded = await loadLayout(routePath);

  await loadPageContent(routePath, params, { layoutLoaded });
  await loadPageScript(routePath, params);
  // document.body.removeAttribute("style");
}

window.addEventListener("hashchange", loadPage);
window.addEventListener("DOMContentLoaded", loadPage);
