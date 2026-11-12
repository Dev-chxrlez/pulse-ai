const js = require('@eslint/js');
const globals = require('globals');
module.exports = [js.configs.recommended, {files:['**/*.js','**/*.jsx','**/*.mjs'],languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{'no-unused-vars':['error',{varsIgnorePattern:'^[A-Z]',argsIgnorePattern:'^[_A-Z]'}]}}];
