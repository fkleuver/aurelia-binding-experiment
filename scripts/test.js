const fs = require('fs');
const puppeteer = require('puppeteer');
const Browserify = require('browserify');

const isWindows = process.platform === 'win32' || /^(msys|cygwin)$/.test(process.env.OSTYPE);
// separator char
const s = String.fromCharCode(isWindows ? 92 : 47);

const scriptPath = process.argv[1];
const projectRoot = scriptPath.slice(0, scriptPath.length - '/scripts/test.js'.length);
const testBuildDir = `${projectRoot}${s}test${s}build`;
const testRunnerPath = `${testBuildDir}${s}testrunner.html`;

const opts = {
  headless: false,
  slowMo: 100,
  timeout: 10000
};

function getFilesSync(opts) {
  let { files, basePath, regex } = opts;
  regex = regex || /\.spec\.[tj]s$/i;
  if (fs.statSync(basePath).isFile()) {
    return regex.test(basePath) ? basePath : null;
  }
  files = files || [];
  const entries = fs.readdirSync(basePath);
  for (const entry of entries) {
    const innerEntries = getFilesSync({ basePath: `${basePath}${s}${entry}`, regex });
    if (Array.isArray(innerEntries)) {
      files.push(...innerEntries);
    } else if (innerEntries !== null) {
      files.push(innerEntries);
    }
  }
  return files;
}

const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Tests</title>
    <link rel="stylesheet" href="../../node_modules/mocha/mocha.css">
  </head>
  <body>
    <div id="mocha"></div>

    <script src="../../node_modules/bluebird/js/browser/bluebird.core.min.js"></script>
    <script src="../../node_modules/mocha/mocha.js" type="text/javascript" charset="utf-8"></script>
    <script src="../../node_modules/chai/chai.js" type="text/javascript" charset="utf-8"></script>
    <script src="../../node_modules/sinon/pkg/sinon.js" type="text/javascript" charset="utf-8"></script>

    <script>
      mocha.setup({
        ui: 'bdd'
      });
      expect = chai.expect;
    </script>
    <script src="./bundle.js"></script>
    <script>
      mocha.run();
    </script>
  </body>
</html>`;

fs.writeFileSync(testRunnerPath, html, { encoding: 'utf-8' })

const browserify = new Browserify();
const specFiles = getFilesSync({ basePath: `${testBuildDir}${s}test` });
browserify.add(specFiles);

const writeStream = fs.createWriteStream(`${testBuildDir}${s}bundle.js`, { encoding: 'utf-8' });
browserify.bundle().pipe(writeStream).on('finish', () => {
  puppeteer.launch(opts)
  .then(browser => browser.newPage())
  .then(page => {
    return page.goto(`file:///${testRunnerPath}`);
  });
});
