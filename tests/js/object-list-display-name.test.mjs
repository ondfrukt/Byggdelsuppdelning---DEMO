import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    resolveObjectDisplayName,
    normalizeTypeName,
    getValueByField
} = require('../../static/js/components/object-list-display-name.js');

test('normalizeTypeName lowercases and trims', () => {
    assert.equal(normalizeTypeName('  Vägg  '), 'vägg');
});

test('getValueByField supports case-insensitive lookup', () => {
    assert.equal(getValueByField({ Namn: 'Dörr A' }, 'namn'), 'Dörr A');
});

test('resolveObjectDisplayName uses configured field per object type', () => {
    const obj = {
        auto_id: 'DO-1',
        object_type: { name: 'Dörr' },
        data: { benamning: 'Entrédörr', name: 'Fallback Name' }
    };

    const value = resolveObjectDisplayName(obj, { dörr: 'benamning' });
    assert.equal(value, 'Entrédörr');
});

test('resolveObjectDisplayName falls back in expected order', () => {
    const obj = {
        auto_id: 'OBJ-7',
        object_type: { name: 'Fönster' },
        data: {
            title: 'Titelvärde',
            label: 'Etikettvärde'
        }
    };

    const value = resolveObjectDisplayName(obj, { fönster: 'saknas' });
    assert.equal(value, 'Titelvärde');
});

test('resolveObjectDisplayName falls back to id when data is empty', () => {
    const obj = {
        auto_id: 'OBJ-999',
        object_type: { name: 'Okänd' },
        data: { name: '   ' }
    };

    const value = resolveObjectDisplayName(obj, { okänd: 'display_field' });
    assert.equal(value, 'OBJ-999');
});
