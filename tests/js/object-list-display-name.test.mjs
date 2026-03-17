import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    resolveObjectDisplayName,
    resolveObjectDescription,
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

test('resolveObjectDescription prefers provided field and supports case-insensitive lookup', () => {
    const obj = {
        data: {
            'Description - short': 'Kort text',
            Beskrivning: 'Längre text'
        }
    };

    const value = resolveObjectDescription(obj, { preferredFields: ['description - short'] });
    assert.equal(value, 'Kort text');
});

test('resolveObjectDescription falls back across known description aliases', () => {
    const obj = {
        data: {
            'Kort beskrivning': 'Alias fungerar'
        }
    };

    const value = resolveObjectDescription(obj);
    assert.equal(value, 'Alias fungerar');
});
