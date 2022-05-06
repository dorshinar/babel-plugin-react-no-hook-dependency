# babel-plugin-react-no-hook-dependency

A babel plugin to automagically add the deps array to your hook calls.

[![Node.js CI](https://github.com/dorshinar/babel-plugin-react-no-hook-dependency/actions/workflows/node.js.yml/badge.svg)](https://github.com/dorshinar/babel-plugin-react-no-hook-dependency/actions/workflows/node.js.yml)

## Examples

### Adding dependency array to `useMemo` call

#### In

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  });
  return <></>;
}
```

#### Out

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  }, [state]);
  return <></>;
}
```

### Leaving hook invocation untouched when a deps array is provided

#### In

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  }, [state]);
  return <></>;
}
```

#### Out

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  }, [state]);
  return <></>;
}
```

### Using a hook with no deps array

#### In

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  }, undefined);
  return <></>;
}
```

#### Out

```jsx
function App() {
  const [state, setState] = useState(0);
  const toDisplay = useMemo(() => {
    return state;
  });
  return <></>;
}
```

## Install

Using NPM:

```sh
npm install --save-dev babel-plugin-react-no-hook-dependency
```

Using yarn:

```sh
yarn add babel-plugin-react-no-hook-dependency --dev
```
