class LVar {
  #id: string;
  constructor(id: string) {
    this.#id = id;
  }
  get id(): string {
    return this.#id;
  }
  toString(): string {
    return this.id;
  }
}

let lvarCounter = 0; // global counter
function lvar(id?: string) {
  if (!id) {
    id = `~.${lvarCounter}`;
    lvarCounter += 1;
  }
  return new LVar(id);
}

class ImmutableMap {
  #data: [any, any][];
  constructor(data: [any, any][] = []) {
    this.#data = data; // [[key, val]]
  }

  set(key: any, val: any): ImmutableMap {
    let find = false,
      data: [any, any][] = [];
    for (let i = 0; i < this.#data.length; i++) {
      const pair = this.#data[i];
      if (key !== pair[0]) {
        data.push(pair);
      }
    }
    data.push([key, val]);
    return new ImmutableMap(data);
  }

  get(key: any): any {
    for (let i = 0; i < this.#data.length; i++) {
      const pair = this.#data[i];
      if (key === pair[0]) return pair[1];
    }
    return undefined;
  }

  toMap(): Map<any, any> {
    return new Map(this.#data);
  }

  pprint(): void {
    console.log(this.toMap());
  }

  toString(): string {
    return this.toMap().toString();
  }
}

/*
class Domain {
  constructor(min, max) {
    this.min = min
    this.max = max
  }

  equal(v) {
    if (isDomain(v)) {
      return this.min === v.min && this.max === v.max
    } else if (typeof(v) === 'number') {
      return v >= this.min && v <= this.max
    } else {
      return v === this
    }
  }

  toNumber() {
    if (this.min === this.max)
      return this.min
    else
      return this
  }
}
const REAL_DOMAIN = new Domain(-Infinity, Infinity)

function isDomain(x) {
  return x && x.constructor === Domain
}
*/

function isLVar(x: any): boolean {
  return x && x.constructor === LVar;
}

function isArray(x: any): boolean {
  return x && x.constructor === Array;
}

function pprint(x: any): void {
  if (x && x.constructor === ImmutableMap) {
    x.pprint();
  } else {
    console.log(x);
  }
}

const dot = function () {};

/**
 * Walk
 * x, {x=>12}        => 12
 * x, {x=>y}         => y
 * x, {x=>y, y=>13}  => 13
 * x, {y=>12}        => x
 */
function walk(key: any, sMap: ImmutableMap): any {
  if (isLVar(key)) {
    const val = sMap.get(key);
    if (val === undefined) return key; // not found
    return walk(val, sMap); // continue
  } else {
    return key;
  }
}

function deepwalk(key: any, sMap: ImmutableMap): any {
  const val = walk(key, sMap);
  if (isArray(val)) {
    // return val.map((x) => deepwalk(x, sMap))
    let o = [];
    for (let i = 0; i < val.length; i++) {
      const x = val[i];
      if (x === dot) {
        const rest: any = deepwalk(val[i + 1], sMap);
        o = o.concat(rest);
        break;
      } else {
        o.push(deepwalk(x, sMap));
      }
    }
    return o;
  } else {
    return val;
  }
}

/**
 * Unify
 *
 * @params: x, y, sMap
 * @goal: make x and y equal in sMap
 *
 * x, 12, {} => {x=>12}
 * x, y, {} => {x=>y}
 * x, m, {x=>12, m=>n} => {x=>12, m=>n, n=>x}
 */
function unify(x: any, y: any, sMap: ImmutableMap): ImmutableMap | null {
  x = walk(x, sMap);
  y = walk(y, sMap);
  const xIsLVar = isLVar(x),
    yIsLVar = isLVar(y);

  if (x === y) {
    return sMap;
  } else if (xIsLVar) {
    return sMap.set(x, y);
  } else if (yIsLVar) {
    return sMap.set(y, x);
  } else if (isArray(x) && isArray(y)) {
    return unifyArray(x, y, sMap);
  } else { // failed to unify
    return null;
  }
}

// x and y are arrays
function unifyArray(x: any, y: any, sMap: ImmutableMap): ImmutableMap | null {
  if (!x.length && !y.length) return sMap;
  if (x[0] === dot) {
    return unify(x[1], y, sMap);
  } else if (y[0] === dot) {
    return unify(y[1], x, sMap);
  } else if (
    (x.length && !y.length) ||
    (!x.length && y.length)
  ) {
    return null;
  }

  const s = unify(x[0], y[0], sMap);
  return s && unify(x.slice(1), y.slice(1), s);
}

function succeed(): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    yield sMap;
  };
}

function fail(): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    yield null;
  };
}

/**
 * and
 */
function and(
  ...clauses: (GeneratorFunction | Function)[]
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    function* helper(offset: number, sMap: ImmutableMap): any {
      if (offset === clauses.length) return;

      let clause = clauses[offset];
      while (clause.constructor.name !== "GeneratorFunction") {
        clause = clause();
      }

      let gen = clause(sMap);
      while (true) {
        let res = gen.next(),
          sMap = res.value;
        if (res.done) break;
        if (sMap) {
          if (offset === clauses.length - 1) {
            yield sMap;
          } else {
            yield* helper(offset + 1, sMap);
          }
        } else { // error
          yield null; // failed
        }
      }
    }

    yield* helper(0, sMap);
  };
}

/**
 * or
 */
function or(
  ...clauses: (GeneratorFunction | Function)[]
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  let count: boolean | number = false,
    startOffst = 0,
    solNum = 0;
  if (typeof (clauses[0]) === "number") {
    count = clauses[0];
    startOffst = 1;
  }
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    function* helper(
      offset: number,
      sMap: ImmutableMap,
      solNum: number,
    ): Generator<ImmutableMap | null> {
      if (offset === clauses.length) return;

      let clause = clauses[offset];
      while (clause.constructor.name !== "GeneratorFunction") {
        clause = clause();
      }

      const gen = clause(sMap);
      while (true) {
        const res = gen.next(),
          sMap = res.value;
        if (res.done) break;
        if (sMap) {
          yield sMap;
          solNum++;
          if (count && solNum >= count) return;
        }
      }

      yield* helper(offset + 1, sMap, solNum);
    }

    yield* helper(startOffst, sMap, solNum);
  };
}

/**
 * eq
 */
function eq(x: any, y: any) {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    yield unify(x, y, sMap);
  };
}

/**
 * run
 */
function run(
  num: number | (LVar[] | LVar),
  vars: (LVar[] | LVar) | (GeneratorFunction | Function),
  goal?: (GeneratorFunction | Function),
) {
  lvarCounter = 0; // reset counter
  if (arguments.length === 2) {
    goal = vars as (GeneratorFunction | Function);
    vars = num as (LVar[] | LVar);
    num = -1; // get all possible results
  }

  while (goal!.constructor.name !== "GeneratorFunction") {
    goal = goal!();
  }

  if (!(vars instanceof Array)) {
    vars = [vars as LVar];
  }

  const results = [];
  let sMap = new ImmutableMap(),
    gen = goal!(sMap);

  while (num) {
    const res = gen.next(),
      sMap = res.value;
    if (res.done) break;
    if (sMap) {
      (num as number) -= 1;
      const r = {}; // new Map()
      vars.forEach((v: any) => {
        r[v as keyof Object] = deepwalk(v, sMap);
      });
      results.push(r);
    }
  }
  // console.log(sMap)
  return results;
}

function conso(
  first: any,
  rest: any,
  out: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  if (isLVar(rest)) {
    return eq([first, dot, rest], out);
  } else {
    return eq([first, ...rest], out);
  }
}

function firsto(
  first: any,
  out: any,
): () => (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function (
    rest = lvar(),
  ): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
    return conso(first, rest, out);
  };
}

function resto(
  rest: any,
  out: any,
): () => (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function (
    first = lvar(),
  ): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
    return conso(first, rest, out);
  };
}

function emptyo(
  x: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return eq(x, []);
}

function membero(
  x: any,
  arr: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return or(
    (first = lvar()) =>
      and(
        firsto(first, arr),
        eq(first, x),
      ),
    (rest = lvar()) =>
      and(
        resto(rest, arr),
        membero(x, rest),
      ),
  );
}

function appendo(
  seq1: any,
  seq2: any,
  out: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return or(
    and(emptyo(seq1), eq(seq2, out)),
    (first = lvar(), rest = lvar(), rec = lvar()) =>
      and(
        conso(first, rest, seq1),
        conso(first, rec, out),
        appendo(rest, seq2, rec),
      ),
  );
}

/*
  Constraints has to be sequential
 */
// a + b = c
function add(
  a: number | LVar,
  b: number | LVar,
  c: number | LVar,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    let numOfLVars = 0,
      lvar_ = null;

    a = walk(a, sMap);
    b = walk(b, sMap);
    c = walk(c, sMap);

    const aIsLVar = isLVar(a),
      bIsLVar = isLVar(b),
      cIsLVar = isLVar(c);

    if (aIsLVar) {
      lvar_ = a;
      numOfLVars++;
    }
    if (bIsLVar) {
      lvar_ = b;
      numOfLVars++;
    }
    if (cIsLVar) {
      lvar_ = c;
      numOfLVars++;
    }

    if (numOfLVars === 0) {
      if ((a as number) + (b as number) === c) yield sMap;
      else yield null;
    } else if (numOfLVars === 1) {
      if (lvar_ === a) {
        if (typeof (c) === "number" && typeof (b) === "number") {
          yield* eq(a, c - b)(sMap);
        } else {
          yield null;
        }
      } else if (lvar_ === b) {
        if (typeof (c) === "number" && typeof (a) === "number") {
          yield* eq(b, c - a)(sMap);
        } else {
          yield null;
        }
      } else { // c
        if (typeof (a) === "number" && typeof (b) === "number") {
          yield* eq(c, a + b)(sMap);
        } else {
          yield null;
        }
      }
    } else {
      yield null;
    }
  };
}

// a - b = c
function sub(
  a: number | LVar,
  b: number | LVar,
  c: number | LVar,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return add(b, c, a);
}

// a * b = c
function mul(
  a: number | LVar,
  b: number | LVar,
  c: number | LVar,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    let numOfLVars = 0,
      lvar_ = null;

    a = walk(a, sMap);
    b = walk(b, sMap);
    c = walk(c, sMap);

    if (isLVar(a)) {
      lvar_ = a;
      numOfLVars++;
    }
    if (isLVar(b)) {
      lvar_ = b;
      numOfLVars++;
    }
    if (isLVar(c)) {
      lvar_ = c;
      numOfLVars++;
    }

    if (numOfLVars === 0) {
      if ((a as number) * (b as number) === c) yield sMap;
      else yield null;
    } else if (numOfLVars === 1) {
      if (lvar_ === a) {
        if (typeof (c) === "number" && typeof (b) === "number") {
          yield* eq(a, c / b)(sMap);
        } else {
          yield null;
        }
      } else if (lvar_ === b) {
        if (typeof (c) === "number" && typeof (a) === "number") {
          yield* eq(b, c / a)(sMap);
        } else {
          yield null;
        }
      } else { // c
        if (typeof (a) === "number" && typeof (b) === "number") {
          yield* eq(c, a * b)(sMap);
        } else {
          yield null;
        }
      }
    } else {
      yield null;
    }
  };
}

// a / b = c
function div(
  a: number | LVar,
  b: number | LVar,
  c: number | LVar,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return mul(b, c, a);
}

function lt(
  x: any,
  y: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    x = walk(x, sMap);
    y = walk(y, sMap);
    if (isLVar(x) || isLVar(y)) {
      yield null;
    } else if (x < y) yield sMap;
    yield null;
  };
}

function le(
  x: any,
  y: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    x = walk(x, sMap);
    y = walk(y, sMap);
    if (isLVar(x) || isLVar(y)) {
      yield null;
    } else if (x <= y) {
      yield sMap;
    }
    yield null;
  };
}

function gt(
  x: any,
  y: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return lt(y, x);
}

function ge(
  x: any,
  y: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return le(y, x);
}

function stringo(
  x: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    const val = walk(x, sMap);
    if (typeof (val) === "string") yield sMap;
    yield null; // not of type string
  };
}

function numbero(
  x: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    const val = walk(x, sMap);
    if (typeof (val) === "number") yield sMap;
    yield null; // not of type number
  };
}

function arrayo(
  x: any,
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    const val = walk(x, sMap);
    if (isArray(val)) yield sMap;
    yield null; // not of type array
  };
}

/**
 * fact
 */
function facts(
  ...facs: any[]
): (...args: any[]) => (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function (...args: any[]) {
    return or.apply(
      null,
      facs.map((fac) =>
        and.apply(null, fac.map((facArg: any, i: any) => eq(facArg, args[i])))
      ),
    );
  };
}

function anyo(
  goal: (GeneratorFunction | Function),
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return or(goal, () => anyo(goal));
}

function not(
  clause: (GeneratorFunction | Function),
): (sMap: ImmutableMap) => Generator<ImmutableMap | null> {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    while (clause.constructor.name !== "GeneratorFunction") {
      clause = clause();
    }
    let gen = clause(sMap);
    let hasSolution = false;
    while (true) {
      let res = gen.next();
      if (res.value) {
        hasSolution = true;
        break;
      }
      if (res.done) break;
    }
    if (hasSolution) {
      yield null;
    } else {
      yield sMap;
    }
  };
}

export {
  add,
  and,
  anyo,
  appendo,
  arrayo,
  conso,
  div,
  emptyo,
  eq,
  facts,
  fail,
  firsto,
  ge,
  gt,
  ImmutableMap,
  isLVar,
  le,
  lt,
  LVar,
  lvar,
  membero,
  mul,
  not,
  numbero,
  or,
  resto,
  run,
  stringo,
  sub,
  succeed,
  walk,
};
