import { assert, describe, test } from "vitest";
import { addHooksDeps } from "./add-hooks-deps";
import babel, { TransformOptions } from "@babel/core";

type NormalizedString = string & { __normalized: true };

/**
 * A string template tag that removes padding from the left side of multi-line strings
 * @param {Array} strings array of code strings (only one expected)
 * @link https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/__tests__/ESLintRuleExhaustiveDeps-test.js
 */
function normalizeIndent(strings: TemplateStringsArray): NormalizedString {
  const codeLines = strings[0].split("\n");
  const leftPadding = codeLines?.[1].match(/\s+/)?.[0] ?? "";
  return codeLines
    .filter((_, i) => i !== 0)
    .map((line) => line.substring(leftPadding.length))
    .join("\n") as NormalizedString;
}

interface Test {
  title: string;
  input: NormalizedString;
  output: NormalizedString;
  only?: true;
}

const useMemoTests: Test[] = [
  {
    title: "basic variable",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
            return state;
        });
        return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "property of variable",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
              let a = state.foo;
              return a;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo;
          return a;
        }, ["state.foo"]);
        return <></>;
      }`,
  },
  {
    title: "object and property of same object",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
              let a = state.foo;
              return state;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo;
          return state;
        }, ["state.foo", "state"]);
        return <></>;
      }`,
  },
  {
    title: "nested properties",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
              let a = state.foo.bar.baz;
              return a;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo.bar.baz;
          return a;
        }, ["state.foo.bar.baz"]);
        return <></>;
      }`,
  },
  {
    title: "function called on variable",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo();
          return a;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo();
          return a;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "property accessed on function called on variable",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo().bar;
          return state;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo().bar;
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "chained function calls and properties access",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo.bar().baz.qux().one.two.three();
          return state;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo.bar().baz.qux().one.two.three();
          return state;
        }, ["state.foo", "state"]);
        return <></>;
      }`,
  },
  {
    title: "local variable is ignored",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          const b = 1;
          let a = b ?? state;
          return state;
        }, ["state"]);
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          const b = 1;
          let a = b ?? state;
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "module variable is ignored",
    input: normalizeIndent`
      const moduleVar = 3;

      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          const b = moduleVar;
          let a = b ?? state;
          return state;
        }, ["state"]);
        return <></>;
      }`,
    output: normalizeIndent`
      const moduleVar = 3;

      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          const b = moduleVar;
          let a = b ?? state;
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },

  {
    title: "basic variable as function parameter",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
            let a = () => {};
            return a(state);
        });
        return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = () => {};

          return a(state);
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "property of variable as function parameter",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
            let b = () => {};
            let a = b(state.foo);
            return a;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo);
          return a;
        }, ["state.foo"]);
        return <></>;
      }`,
  },
  {
    title: "object and property of same object as function parameter",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
              let b = () => {};
              let a = b(state.foo);
              return state;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo);
          return state;
        }, ["state.foo", "state"]);
        return <></>;
      }`,
  },
  {
    title: "nested properties as function parameter",
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
            let b = () => {};

            let a = b(state.foo.bar.baz);
            return a;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo.bar.baz);
          return a;
        }, ["state.foo.bar.baz"]);
        return <></>;
      }`,
  },
  {
    title: "function called on variable as function parameter",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo())
          return a;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo());
          return a;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title:
      "property accessed on function called on variable as function parameter",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo().bar);
          return state;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo().bar);
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
    title: "chained function calls and properties access as function parameter",
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo.bar().baz.qux().one.two.three());
          return state;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let b = () => {};

          let a = b(state.foo.bar().baz.qux().one.two.three());
          return state;
        }, ["state.foo", "state"]);
        return <></>;
      }`,
  },
];
const useEffectTests: Test[] = [
  {
    title: "sanity",
    input: normalizeIndent`
    function App() {
      const [state, setState] = useState(0);
      const toDisplay = useMemo(() => {
        return state;
      });
      return <></>;
    }`,
    output: normalizeIndent`
    function App() {
      const [state, setState] = useState(0);
      const toDisplay = useMemo(() => {
        return state;
      }, ["state"]);
      return <></>;
    }`,
  },
];
const useCallbackTests: Test[] = [
  {
    title: "sanity",
    input: normalizeIndent`
    function App() {
      const [state, setState] = useState(0);
      const toDisplay = useCallback(() => {
        return state;
      });
      return <></>;
    }`,
    output: normalizeIndent`
    function App() {
      const [state, setState] = useState(0);
      const toDisplay = useCallback(() => {
        return state;
      }, ["state"]);
      return <></>;
    }`,
  },
];

const babelConfig: TransformOptions = {
  sourceType: "module",
  // using the "@babel/plugin-syntax-jsx" plugin to preserve JSX
  plugins: ["@babel/plugin-syntax-jsx", addHooksDeps],
};

function runTest({ input, output, only, title }: Test) {
  const testBody = () => {
    const { code } = babel.transform(input, babelConfig) ?? {
      code: "",
    };
    assert.equal(code, output);
  };

  if (only) {
    test.only(title, testBody);
  } else {
    test(title, testBody);
  }
}

describe("add deps", () => {
  describe("useMemo", () => {
    useMemoTests.forEach((testData) => {
      runTest(testData);
    });
  });
  describe("useEffect", () => {
    useEffectTests.forEach((testData) => {
      runTest(testData);
    });
  });
  describe("useCallback", () => {
    useCallbackTests.forEach((testData) => {
      runTest(testData);
    });
  });
});
