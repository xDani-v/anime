import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTime, seekStep, seekTarget, showSkipIntro } from '../app/src/ui/seek.js';

test('fmtTime formatea minutos y horas', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(75), '1:15');
  assert.equal(fmtTime(3725), '1:02:05');
  assert.equal(fmtTime(59.9), '0:59');
});

test('fmtTime tolera valores no válidos', () => {
  for (const v of [NaN, undefined, -5, Infinity]) assert.equal(fmtTime(v), '0:00');
});

test('seekStep acelera con pulsaciones seguidas', () => {
  assert.equal(seekStep(0), 10);
  assert.equal(seekStep(2), 10);
  assert.equal(seekStep(3), 30);
  assert.equal(seekStep(7), 30);
  assert.equal(seekStep(8), 60);
});

test('seekTarget se acota entre 0 y la duración', () => {
  assert.equal(seekTarget(100, 1, 30, 1400), 130);
  assert.equal(seekTarget(5, -1, 30, 1400), 0);
  assert.equal(seekTarget(1390, 1, 60, 1400), 1400);
  assert.equal(seekTarget(10, 1, 10, NaN), 20);
});

test('showSkipIntro solo al inicio de episodios largos y una vez', () => {
  assert.equal(showSkipIntro(30, 1400, false), true);
  assert.equal(showSkipIntro(1, 1400, false), false);    // aún muy al inicio
  assert.equal(showSkipIntro(300, 1400, false), false);  // pasó la ventana
  assert.equal(showSkipIntro(30, 300, false), false);    // video corto
  assert.equal(showSkipIntro(30, 1400, true), false);    // ya usado
});
