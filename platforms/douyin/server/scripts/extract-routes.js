require('reflect-metadata');

const { METHODS } = require('node:http');
const fs = require('fs');
const path = require('path');
const { RequestMethod } = require('@nestjs/common');
const { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const { MetadataScanner } = require('@nestjs/core');

const OUTPUT_FILE = '/tmp/routes/server-routes.json';
const ALL_HTTP_METHODS = METHODS.map((method) => method.toLowerCase());

function asArray(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [value];
  if (value.length === 0) return [];
  return value;
}

function asPathArray(value, label) {
  return asArray(value).map((item) => {
    if (typeof item !== 'string') {
      throw new TypeError(`${label} must be a string or an array of strings`);
    }
    return item;
  });
}

function addLeadingSlash(routePath) {
  if (!routePath || typeof routePath !== 'string') return '';
  return routePath.charAt(0) !== '/' && routePath.substring(0, 2) !== '{/'
    ? `/${routePath}`
    : routePath;
}

function stripEndSlash(routePath) {
  return routePath[routePath.length - 1] === '/'
    ? routePath.slice(0, routePath.length - 1)
    : routePath;
}

function joinRoutePaths(controllerPath, handlerPath) {
  let routePath = '';

  for (const fragment of [controllerPath, handlerPath]) {
    if (fragment) {
      routePath = stripEndSlash(routePath) + addLeadingSlash(fragment);
    }
  }

  routePath = addLeadingSlash(routePath || '/');
  return routePath !== '/' ? stripEndSlash(routePath) : routePath;
}

function getHttpMethods(requestMethod) {
  if (requestMethod === RequestMethod.ALL) {
    return [...ALL_HTTP_METHODS];
  }

  const methodName = RequestMethod[requestMethod];
  if (typeof methodName !== 'string') {
    throw new TypeError(`Unsupported Nest request method: ${String(requestMethod)}`);
  }

  return [methodName.toLowerCase()];
}

function getModuleMetadata(metadataKey, moduleClass) {
  return asArray(Reflect.getMetadata(metadataKey, moduleClass));
}

function extractControllerRoutes(controllerClass, metadataScanner) {
  if (typeof controllerClass !== 'function' || !controllerClass.prototype) {
    throw new TypeError('Controller metadata must contain controller classes');
  }

  const controllerPathMetadata = Reflect.getMetadata(PATH_METADATA, controllerClass);
  if (controllerPathMetadata === undefined) {
    throw new TypeError(`${controllerClass.name} is missing @Controller() path metadata`);
  }

  const controllerPaths = asPathArray(
    controllerPathMetadata,
    `${controllerClass.name} controller path`,
  );
  const handlers = [];

  for (const methodName of metadataScanner.getAllMethodNames(controllerClass.prototype)) {
    const handler = controllerClass.prototype[methodName];
    const handlerPathMetadata = Reflect.getMetadata(PATH_METADATA, handler);

    if (handlerPathMetadata === undefined) continue;

    const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
    if (requestMethod === undefined) {
      throw new TypeError(`${controllerClass.name}.${methodName} is missing request method metadata`);
    }

    handlers.push({
      paths: asPathArray(
        handlerPathMetadata,
        `${controllerClass.name}.${methodName} route path`,
      ),
      methods: getHttpMethods(requestMethod),
    });
  }

  const routes = [];
  for (const controllerPath of controllerPaths) {
    for (const handler of handlers) {
      for (const handlerPath of handler.paths) {
        routes.push({
          path: joinRoutePaths(controllerPath, handlerPath),
          methods: handler.methods,
        });
      }
    }
  }

  return routes;
}

async function extractRoutes(rootModule) {
  const routes = [];
  const metadataScanner = new MetadataScanner();
  const visitedModuleClasses = new WeakSet();
  const visitedDynamicModules = new WeakSet();
  const visitedForwardRefs = new WeakSet();

  function scanControllers(controllers) {
    for (const controller of asArray(controllers)) {
      routes.push(...extractControllerRoutes(controller, metadataScanner));
    }
  }

  async function scanModuleClass(moduleClass) {
    if (typeof moduleClass !== 'function') {
      throw new TypeError('Module metadata must contain module classes or DynamicModule objects');
    }
    if (visitedModuleClasses.has(moduleClass)) return;

    visitedModuleClasses.add(moduleClass);
    scanControllers(getModuleMetadata(MODULE_METADATA.CONTROLLERS, moduleClass));

    for (const importedModule of getModuleMetadata(MODULE_METADATA.IMPORTS, moduleClass)) {
      await scanModule(importedModule);
    }
  }

  async function scanModule(moduleDefinition) {
    let resolvedModule = await moduleDefinition;
    if (resolvedModule === undefined || resolvedModule === null) return;

    while (typeof resolvedModule?.forwardRef === 'function') {
      if (visitedForwardRefs.has(resolvedModule)) return;
      visitedForwardRefs.add(resolvedModule);
      resolvedModule = await resolvedModule.forwardRef();
    }

    if (typeof resolvedModule === 'object' && resolvedModule.module) {
      if (visitedDynamicModules.has(resolvedModule)) return;
      visitedDynamicModules.add(resolvedModule);

      await scanModule(resolvedModule.module);
      scanControllers(resolvedModule.controllers);

      for (const importedModule of asArray(resolvedModule.imports)) {
        await scanModule(importedModule);
      }
      return;
    }

    await scanModuleClass(resolvedModule);
  }

  await scanModule(rootModule);
  return routes;
}

function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function writeRoutes(routes) {
  const outDir = path.dirname(OUTPUT_FILE);
  const tempFile = path.join(
    outDir,
    `.${path.basename(OUTPUT_FILE)}.${process.pid}.${Date.now()}.tmp`,
  );

  fs.mkdirSync(outDir, { recursive: true });
  try {
    fs.writeFileSync(tempFile, JSON.stringify(routes, null, 2));
    fs.renameSync(tempFile, OUTPUT_FILE);
  } finally {
    removeFileIfExists(tempFile);
  }
}

async function main() {
  removeFileIfExists(OUTPUT_FILE);
  const { AppModule } = require('../dist/app.module');
  const routes = await extractRoutes(AppModule);
  writeRoutes(routes);
}

main().then(
  () => process.exit(0),
  (error) => {
    const details = error instanceof Error ? error.stack || error.message : String(error);
    fs.writeSync(process.stderr.fd, `[extract-routes] Failed to extract routes:\n${details}\n`);
    process.exit(1);
  },
);
