/**
 * Function composition utilities for Functional Programming
 * Enables clean, readable data transformations
 */

/**
 * Pipe - applies functions left to right
 * @example
 * const processData = pipe(validate, normalize, transform)
 * processData(data) // validate(data) -> normalize() -> transform()
 */
export const pipe =
    <T>(...fns: Array<(arg: T) => T>) =>
    (value: T): T =>
        fns.reduce((acc, fn) => fn(acc), value);

/**
 * Compose - applies functions right to left
 * @example
 * const processData = compose(transform, normalize, validate)
 * processData(data) // transform(normalize(validate(data)))
 */
export const compose =
    <T>(...fns: Array<(arg: T) => T>) =>
    (value: T): T =>
        fns.reduceRight((acc, fn) => fn(acc), value);

/**
 * Async pipe - for async function composition
 */
export const pipeAsync =
    <T>(...fns: Array<(arg: T) => Promise<T>>) =>
    async (value: T): Promise<T> => {
        let result = value;
        for (const fn of fns) {
            result = await fn(result);
        }
        return result;
    };

/**
 * Curry - transforms a function with multiple args into a sequence of unary functions
 */
export const curry = <Args extends unknown[], R>(
    fn: (...args: Args) => R,
    arity: number = fn.length
): ((...args: Partial<Args>) => R | ((...args: unknown[]) => R)) => {
    const curried = (...args: unknown[]): unknown => {
        if (args.length >= arity) {
            return fn(...(args as Args));
        }
        return (...next: unknown[]) => curried(...args, ...next);
    };
    return curried as (...args: Partial<Args>) => R | ((...args: unknown[]) => R);
};

/**
 * Partial application - pre-fills some arguments
 */
export const partial =
    <Args extends unknown[], Rest extends unknown[], R>(
        fn: (...args: [...Args, ...Rest]) => R,
        ...presetArgs: Args
    ) =>
    (...rest: Rest): R =>
        fn(...presetArgs, ...rest);

/**
 * Identity - returns input unchanged (useful for default cases)
 */
export const identity = <T>(value: T): T => value;

/**
 * Constant - returns a function that always returns the same value
 */
export const constant =
    <T>(value: T) =>
    (): T =>
        value;

/**
 * Tap - performs side effect and returns original value
 */
export const tap =
    <T>(fn: (value: T) => void) =>
    (value: T): T => {
        fn(value);
        return value;
    };
