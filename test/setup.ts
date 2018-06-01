import 'aurelia-polyfills';
import { initialize } from 'aurelia-pal-browser';
initialize();

const testContext = require.context('.', true, /\.spec\.[tj]s$/i);
for (const key of testContext.keys()) {
  testContext(key);
}
