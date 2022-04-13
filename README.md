# logic_ts

Library for using the logic programming paradigm in TypeScript. This project has
a core based on niniKanren, adapted from: https://github.com/shd101wyy/logic.js

## Usages

The arrow notation "=>" is needed to delay execution and calculate variables
correctly. You should also use this notation in recursive calls.

### Core

```javascript
import { and, eq, lvar, or, run } from "https://deno.land/x/logic_ts/mod.ts";

const x = lvar("x"); // define logic variable with id 'x'

run(1, [x], eq(x, 1)); // query 'x' => [{x: 1}]
run(1, [x], (y = lvar()) =>
  and(
    () => eq(y, 1),
    () => eq(x, y),
  )); // => [{x: 1}]

run([x], or(() => eq(x, 1), () => eq(x, 2))); // [{x: 1}, {x: 2}]
run(1, [x], or(() => eq(x, 1), () => eq(x, 2))); // [{x: 1}]
```

### Negation (negation by failure)

```javascript
import { not } from "https://deno.land/x/logic_ts/mod.ts";
run(
  1,
  [x],
  and(
    () => eq(x, 1),
    () => not(() => eq(2, 1)),
  ),
); // => [{x: 1}]
```

### Facts

```javascript
import { facts } from "https://deno.land/x/logic_ts/mod.ts";
// FACT
const parent = facts(["Steve", "Bob"], // Steve is Bob's parent
["Steve", "Henry"], // Steve is Henry's parent
["Henry", "Alice"]); // Henry is Alice's parent
const x = lvar();
run(1, [x], parent(x, "Alice")); // who is Alice's parent => ['Henry']
run(2, [x], parent("Steve", x)); // who are Steve's children => ['Bob', 'Henry']

// RULE
const grandparent = (x: any, y: any) => {
  let z = lvar();
  return and(() => parent(x, z), () => parent(z, y)); // x is z's parent and z is y's parent => x is y's parent
};

run(1, [x], grandparent(x, "Alice")); // who is Alice's grandparent => ['Steve']
```

### Array manipulation

```javascript
import {
  appendo,
  conso,
  emptyo,
  firsto,
  membero,
  resto,
} from "https://deno.land/x/logic_ts/mod.ts";

const x = lvar("x"),
  y = lvar("y");

run([x], membero(x, [1, 2, 3]));
// [{x: 1}, {x: 2}, {x: 3}]

run([x, y], conso(x, y, [1, 2, 3]));
// [{x: 1, y: [2, 3]}]

run([x, y], appendo(x, y, [1, 2]));
/*
[ {x: [], y: [1, 2]},
{x: [1], y: [2]}
{x: [1, 2], y: []} ]
*/
```

### Arithmetic & Comparison

```javascript
import {
  add,
  div,
  ge,
  gt,
  le,
  lt,
  mul,
  sub,
} from "https://deno.land/x/logic_ts/mod.ts";

run([x], add(2, x, 5));
// [{x: 3}]
```

### Extra

```javascript
import { anyo, fail, succeed } from "https://deno.land/x/logic_ts/mod.ts";

run([x], and(() => eq(x, 1), () => succeed()));
// [{x: 1}]

run([x], and(() => eq(x, 1), () => fail()));
// []

run(
  [x],
  or(
    () => eq(x, 1),
    () => eq(x, 2),
    () => eq(x, 3),
  ),
); // [{x: 1}, {x: 2}, {x: 3}]

run(
  [x],
  or(
    () => eq(x, 1),
    () => and(() => eq(x, 2), () => fail()),
    () => eq(x, 3),
  ),
); // [{x: 1}, {x: 3}]

run(4, [x], anyo(() => or(() => eq(x, 1), () => eq(x, 2), () => eq(x, 3))));
// [{x: 1}, {x: 2}, {x: 3}, {x: 1}]
```

### Interface with the imprative paradigm

You will need to "walk" over the logical variables to get to their values, with
a generator function. Example:

```typescript
const links = (
  x: string | LVar,
  z: LVar, //'return' variable
) => {
  return function* (sMap: ImmutableMap): Generator<ImmutableMap | null> {
    x = walk(x, sMap); //walk all input variables
    if (yourConditionIsTrue) {
      yield sMap;
    } else {
      yield null;
    }
    //Example: delegating responsibility
    yield* eq(z, "my_val")(sMap); //membero(z, myArray)(sMap), etc.
  };
};
```

By using the logic paradigm in JavaScript, it's easy to get a stack overflow.
Maybe you need to optimize some parts of your application with these "interface
functions".

### All imports

```javascript
import {
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
} from "https://deno.land/x/logic_ts/mod.ts";
```

## Bundle lib to any runtime or web browsers:

```
deno bundle https://deno.land/x/logic_ts/mod.ts logic.js
```
