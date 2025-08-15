import assert from 'node:assert/strict';
import { chooseLocale } from '../i18n/request';

// Simple unit tests for chooseLocale
function run() {
  // Happy paths
  assert.equal(chooseLocale('en'), 'en', 'plain en should return en');
  assert.equal(chooseLocale('fa'), 'fa', 'plain fa should return fa');
  assert.equal(chooseLocale('en-US'), 'en', 'en-US should normalize to en');
  assert.equal(chooseLocale('fa-IR'), 'fa', 'fa-IR should normalize to fa');

  // Edge cases
  assert.equal(chooseLocale(undefined), 'fa', 'undefined should fallback to fa');
  assert.equal(chooseLocale('es-ES'), 'fa', 'unsupported locale should fallback to fa');
  assert.equal(chooseLocale('EN-us'), 'fa', 'case-sensitive unknown variant falls back to fa (expected)');

  console.log('All chooseLocale tests passed');
}

run();
