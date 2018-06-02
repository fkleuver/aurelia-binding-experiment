import resolve from 'rollup-plugin-node-resolve';
import commonJS from 'rollup-plugin-commonjs';

const { format, dir } = process.env;
const name = 'aurelia-binding';

export default {
  input: `dist/${dir}/temp/${name}.js`,
  output: { ...{ file: `dist/${dir}/${name}.js`, name, format } },
  plugins: [
    resolve(),
    commonJS({
      include: 'dist/${dir}/temp/*.js'
    })
  ],
  external: [
    'aurelia-task-queue',
    'aurelia-pal',
  ]
};
