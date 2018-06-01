import * as karma from 'karma';
import * as path from 'path';
import * as webpack from 'webpack';

export interface IKarmaConfig extends karma.Config, IKarmaConfigOptions {
  noInfo?: boolean;
  set(config: IKarmaConfigOptions): void;
}

export interface IKarmaConfigOptions extends karma.ConfigOptions {
  webpack: webpack.Configuration;
  customLaunchers: any;
  webpackMiddleware: any;
}

export default (config: IKarmaConfig): void => {
  const options: IKarmaConfigOptions = {
    basePath: config.basePath || './',
    frameworks: ['mocha', 'chai'],
    files: ['test/setup.ts'],
    preprocessors: { 'test/setup.ts': ['webpack', 'sourcemap'] },
    exclude: ['test/**/*.spec.ts'],
    webpack: {
      mode: 'development',
      resolve: {
        extensions: ['.ts', '.js'],
        modules: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'node_modules')
        ],
        alias: {
          bluebird: path.resolve(__dirname, 'node_modules', 'bluebird', 'js', 'browser', 'bluebird.core.min')
        }
      },
      devtool: 'cheap-module-eval-source-map',
      module: {
        rules: [
          {
            test: /\.ts$/i,
            loader: 'ts-loader',
            exclude: /node_modules/i,
            options: {
              configFile: path.resolve(__dirname, 'test', 'tsconfig.json'),
              transpileOnly: true
            }
          },
          {
            test: /[\/\\]node_modules[\/\\]bluebird[\/\\].+\.js$/i,
            loader: 'expose-loader?Promise'
          }
        ]
      },
      plugins: [new webpack.ProvidePlugin({ Promise: 'bluebird' })]
    },
    mime: { 'text/x-typescript': ['ts'] },
    reporters: ['mocha'],
    webpackMiddleware: {
      stats: {
        colors: true,
        hash: false,
        version: false,
        timings: false,
        assets: false,
        chunks: false,
        modules: false,
        reasons: false,
        children: false,
        source: false,
        errors: true,
        errorDetails: true,
        warnings: false,
        publicPath: false
      }
    },
    browsers: config.browsers,
    customLaunchers: {
      ChromeDebugging: {
        base: 'Chrome',
        flags: ['--disable-translate', '--disable-extensions', '--remote-debugging-port=9333'],
        debug: true
      }
    }
  };

  config.set(options);
};
