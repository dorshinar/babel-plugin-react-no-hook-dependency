import type * as types from "@babel/types";
import type { NodePath, TraverseOptions, Visitor } from "@babel/traverse";

type Types = typeof types;

const relevantCallees = new Set(["useMemo", "useCallback", "useEffect"]);
const disallowedIdentifierParents = new Set([
  "VariableDeclarator",
  "MemberExpression",
]);

export function addHooksDeps({ types: t }: { types: Types }): {
  visitor: Visitor;
} {
  return {
    visitor: {
      CallExpression: function (path) {
        if (!isIdentifier(path.node.callee, t)) {
          return;
        }

        if (!isRelevantCallee(path, t)) {
          return;
        }

        // If the hook contains a deps array we want to leave it intact.
        if (hookHasDeps(path, t)) {
          return;
        }

        // If the hook has `undefined` for the deps array, we remove it.
        // This is the way to create hooks without dependencies.
        if (hookHasUndefinedDeps(path, t)) {
          path.node.arguments.pop();
          path.skip();
          return;
        }

        // The names set is a list of all variables and properties accessed in the hook.
        // If a property of an object is accessed, they will appear as `foo.bar` in the array.
        const names = new Set<string>();

        // The scope bindings contains all the variables bound to a value in the scope of the hook call.
        // We need that to make sure we only add variables declared in the component to the deps array.
        const scopeBindings = new Set(Object.keys(path.scope.bindings));

        path.traverse(hookInvocationVisitor, {
          names,
          callee: path.node.callee.name,
          t,
        });

        const stringLiterals: types.Identifier[] = getStringLiteralsFromNames(
          names,
          scopeBindings,
          t
        );
        path.node.arguments.push(t.arrayExpression(stringLiterals));
        path.skip();
      },
    },
  };
}

const memberExpressionInnerVisitor: TraverseOptions<{
  continueTraversal: boolean;
  chainedMembers: string[];
}> = {
  Identifier: function (path) {
    if (this.continueTraversal) {
      this.chainedMembers.push(path.node.name);
    }
  },
  CallExpression: function () {
    this.continueTraversal = false;
  },
};

const innerMostCallExpressionVisitor: Visitor<{ chainedMembers: string[] }> = {
  Identifier: function (path, { chainedMembers }) {
    chainedMembers.push(path.node.name);
  },
};

type CallExpressionVisitorState = {
  chainedMembers: string[];
  innerMostCallExpression: NodePath<types.CallExpression> | undefined;
};

const callExpressionVisitor: Visitor<CallExpressionVisitorState> = {
  Identifier: function (path, state) {
    // When we are not dealing with nested calls we should chain the identifiers found
    state.chainedMembers.push(path.node.name);
  },
  CallExpression: function (path, state) {
    // We store the inner most Call Expression so we can traverse it later
    state.innerMostCallExpression = path;
  },
};

const hookInvocationVisitor: Visitor<{
  names: Set<string>;
  callee: string;
  t: Types;
}> = {
  Identifier: function (path, { names, callee, t }) {
    // We skip certain parent types because in this visitor we only care about "pure" identifiers.
    if (disallowedIdentifierParents.has(path.parent.type)) {
      return;
    }

    if (t.isIdentifier(path.node) && path.node.name !== callee) {
      names.add(path.node.name);
    }
  },
  MemberExpression: (path, { names }) => {
    // We don't need to traverse a "MemberExpression" nested inside another "MemberExpression"
    if (path.parent.type === "MemberExpression") {
      return;
    }

    // If the parent of this node is a "CallExpression", we validate path is an argument to the function
    if (
      path.parent.type === "CallExpression" &&
      !path.parent.arguments.includes(path.node)
    ) {
      return;
    }

    let chainedMembers: string[] = [];
    let continueTraversal = true;

    const state = {
      chainedMembers,
      continueTraversal,
    };
    path.traverse(memberExpressionInnerVisitor, state);

    continueTraversal = state.continueTraversal;
    chainedMembers = state.chainedMembers;

    if (chainedMembers.length) {
      names.add(chainedMembers.join("."));
    }
  },
  CallExpression: (path, { names, t }) => {
    const state: CallExpressionVisitorState = {
      chainedMembers: [],
      innerMostCallExpression: undefined,
    };

    path.traverse(callExpressionVisitor, state);

    let chainedMembers = state.chainedMembers;
    const innerMostCallExpression = state.innerMostCallExpression;

    // If we have found an inner Call Expression, we traverse it to find all identifiers.
    if (t.isCallExpression(innerMostCallExpression)) {
      chainedMembers = [];
      innerMostCallExpression.traverse(innerMostCallExpressionVisitor, {
        chainedMembers,
      });
    }

    if (chainedMembers.length) {
      // The last member is the invoked function, we always want to remove it
      chainedMembers.pop();
      names.add(chainedMembers.join("."));
    }
  },
};

function getStringLiteralsFromNames(
  names: Set<string>,
  scopeBindings: Set<string>,
  t: Types
) {
  const stringLiterals: types.Identifier[] = [];
  for (const name of names) {
    // Get first identifier (before first ".") to make sure it is declared in the component scope.
    const match = name.match(/[^.]+/);
    if (match?.[0] && scopeBindings.has(match?.[0])) {
      stringLiterals.push(t.identifier(name));
    }
  }
  return stringLiterals;
}

function isRelevantCallee(
  path: NodePath<types.CallExpression>,
  t: Types
): boolean {
  if (isIdentifier(path.node.callee, t)) {
    return relevantCallees.has(path.node.callee.name);
  }

  return false;
}

function hookHasDeps(path: NodePath<types.CallExpression>, t: Types): boolean {
  if (path.node.arguments.length < 2) {
    return false;
  }

  const depsArray = path.node.arguments[1];
  return isArrayNode(depsArray, t);
}

function hookHasUndefinedDeps(
  path: NodePath<types.CallExpression>,
  t: Types
): boolean {
  if (path.node.arguments.length < 2) {
    return false;
  }

  const depsArray = path.node.arguments[1];
  return isUndefined(depsArray, t);
}

function isUndefined(node: types.Node, t: Types): boolean {
  if (!isIdentifier(node, t)) {
    return false;
  }

  return node.name === "undefined";
}

function isIdentifier(node: types.Node, t: Types): node is types.Identifier {
  return t.isIdentifier(node);
}

function isArrayNode(
  node: types.Node,
  t: Types
): node is types.ArrayExpression {
  return t.isArrayExpression(node);
}
