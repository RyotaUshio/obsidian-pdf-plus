export class MultiValuedMap<Key, Value> {
    private map = new Map<Key, Set<Value>>();

    addValue(key: Key, value: Value) {
        let values = this.map.get(key);
        if (!values) {
            values = new Set();
            this.map.set(key, values);
        }
        values.add(value);
    }

    get(key: Key): Set<Value> {
        return this.map.get(key) ?? new Set();
    }

    delete(key: Key) {
        this.map.delete(key);
    }

    deleteValue(key: Key, value: Value) {
        const values = this.map.get(key);
        if (values) {
            values.delete(value);
            if (values.size === 0) this.map.delete(key);
        }
    }

    has(key: Key) {
        return this.map.has(key) && this.map.get(key)!.size > 0;
    }

    [Symbol.iterator]() {
        return this.map[Symbol.iterator]();
    }
}


export class BidirectionalMultiValuedMap<Key, Value> {
    private keyToValues = new Map<Key, Set<Value>>();
    private valueToKeys = new Map<Value, Set<Key>>();

    addValue(key: Key, value: Value) {
        if (!this.keyToValues.has(key)) this.keyToValues.set(key, new Set());
        this.keyToValues.get(key)!.add(value);

        if (!this.valueToKeys.has(value)) this.valueToKeys.set(value, new Set());
        this.valueToKeys.get(value)!.add(key);
    }

    get(key: Key): Set<Value> {
        return this.keyToValues.get(key) ?? new Set();
    }

    getKeys(value: Value): Set<Key> {
        return this.valueToKeys.get(value) ?? new Set();
    }

    delete(key: Key) {
        const values = this.keyToValues.get(key);
        if (values) {
            for (const value of values) {
                const keys = this.valueToKeys.get(value);
                if (!keys) {
                    throw new Error('Value has no keys');
                }
                keys.delete(key);
                if (keys.size === 0) this.valueToKeys.delete(value);
            }
        }

        this.keyToValues.delete(key);
    }

    deleteValue(value: Value) {
        const keys = this.valueToKeys.get(value);
        if (keys) {
            for (const key of keys) {
                const values = this.keyToValues.get(key);
                if (!values) {
                    throw new Error('Key has no values');
                }
                values.delete(value);
                if (values.size === 0) this.keyToValues.delete(key);
            }
        }

        this.valueToKeys.delete(value);
    }

    has(key: Key) {
        return this.keyToValues.has(key) && this.keyToValues.get(key)!.size > 0;
    }

    hasValue(value: Value) {
        return this.valueToKeys.has(value) && this.valueToKeys.get(value)!.size > 0;
    }

    keys() {
        return this.keyToValues.keys();
    }

    values() {
        return this.valueToKeys.keys();
    }
}
