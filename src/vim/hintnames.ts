/**
   Copyright 2020 Colin Caine, Oliver Blanthorn and Koushien

   Tridactyl is licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   ================================
   The file was taken from Tridactyl, which is licensed under the Apache License, Version 2.0:
   https://github.com/tridactyl/tridactyl?tab=License-1-ov-file
   Some parts were then modified.
 */

/**
 * Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/content/hinting.ts#L602-L632
 */
export function* hintnames_short(
    n: number,
    hintchars: string,
): IterableIterator<string> {
    const source = hintnames_simple(hintchars);
    const num2skip = Math.max(0, Math.ceil((n - hintchars.length) / (hintchars.length - 1)));
    yield* islice(source, num2skip, n + num2skip);
}

/**
 * An infinite stream of hints
 * Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/content/hinting.ts#L587-L600
 */
function* hintnames_simple(
    hintchars: string,
): IterableIterator<string> {
    for (let taglen = 1; true; taglen++) {
        yield* map(permutationsWithReplacement(hintchars, taglen), e =>
            e.join(''),
        );
    }
}

/** 
 * All permutations of n items from array
 * 
 * Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/lib/itertools.ts#L130-L144
 */
function* permutationsWithReplacement<T>(arr: ArrayLike<T>, n: number) {
    const len = arr.length;
    const counters = new Array(n).fill(0);
    let index = 1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of range(Math.pow(len, n))) {
        yield counters.map(i => arr[i]);
        for (const i of range(counters.length)) {
            if (knuth_mod(index, Math.pow(len, counters.length - 1 - i)) === 0) {
                counters[i] = knuth_mod(counters[i] + 1, len);
            }
        }
        index++;
    }
}

/**
 * islice(iter, stop) = Give the first `stop` elements
 * islice(iter, start, stop)
 *     skip `start` elements, then give `stop - start` elements,
 *     unless `stop` is null, then emit indefinitely
 * 
 *  If the iterator runs out early so will this.
 * 
 *  Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/lib/itertools.ts#L89-L122 
 */
function* islice<T>(iterable: Iterable<T>, start: number, stop?: number) {
    const iter = iterable[Symbol.iterator]();

    // If stop is not defined then they're using the two argument variant
    if (stop === undefined) {
        stop = start;
        start = 0;
    }

    // Skip elements until start
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of range(start)) {
        const res = iter.next();
        if (res.done) return;
    }

    // Emit elements
    for (let i = start; i < stop; i++) {
        const res = iter.next();
        if (res.done) return;
        else yield res.value;
    }
}

/**
 * Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/lib/itertools.ts#L44-L49
 */
function* range(length: number) {
    if (length < 0) return;
    for (let index = 0; index < length; index++) {
        yield index;
    }
}

/** Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/lib/itertools.ts#L146-L148 */
function* map<T>(arr: Iterable<T>, func: (v: T) => any) {
    for (const v of arr) yield func(v);
}

/** 
 * Takes sign of divisor -- incl. returning -0
 * 
 * Taken from https://github.com/tridactyl/tridactyl/blob/4a4c9c7306b436611088b6ff2dceff77e7ccbfd6/src/lib/number.mod.ts#L9-L12
 */
function knuth_mod(dividend: number, divisor: number) {
    return dividend - divisor * Math.floor(dividend / divisor);
}
