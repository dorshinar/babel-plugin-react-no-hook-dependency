import { assert, describe, test } from "vitest";
import { addHooksDeps } from "./add-hooks-deps";
import babel from "@babel/core";

/**
 * A string template tag that removes padding from the left side of multi-line strings
 * @param {Array} strings array of code strings (only one expected)
 * @link https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/__tests__/ESLintRuleExhaustiveDeps-test.js
 */
function normalizeIndent(strings: TemplateStringsArray) {
  const codeLines = strings[0].split("\n");
  const leftPadding = codeLines?.[1].match(/\s+/)?.[0] ?? "";
  return codeLines
    .filter((_, i) => i !== 0)
    .map((line) => line.substring(leftPadding.length))
    .join("\n");
}

const tests = [
  {
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
    input: normalizeIndent`
      function App() {
          const [state, setState] = useState(0);
          const toDisplay = useMemo(() => {
              let a = state.foo.bar.baz;
              return state;
          });
          return <></>
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo.bar.baz;
          return state;
        }, ["state.foo.bar.baz", "state"]);
        return <></>;
      }`,
  },
  {
    input: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo();
          return state;
        });
        return <></>;
      }`,
    output: normalizeIndent`
      function App() {
        const [state, setState] = useState(0);
        const toDisplay = useMemo(() => {
          let a = state.foo();
          return state;
        }, ["state"]);
        return <></>;
      }`,
  },
  {
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
];

describe("add deps", () => {
  tests.forEach(({ input, output }, index) => {
    test(`add deps ${index}`, () => {
      const { code } = babel.transform(input, {
        sourceType: "module",
        // using the "@babel/plugin-syntax-jsx" plugin to preserve JSX
        plugins: ["@babel/plugin-syntax-jsx", addHooksDeps],
      }) ?? {
        code: "",
      };
      assert.equal(code, output);
    });
  });
});
