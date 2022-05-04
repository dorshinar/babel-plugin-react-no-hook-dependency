import { NodePath, TraverseOptions, Visitor } from "@babel/traverse";
import * as types from "@babel/types";
import { Identifier } from "@babel/types";

const relevantCallees = new Set(["useMemo", "useCallback", "useEffect"]);
const disallowedIdentifierParents = new Set([
  "VariableDeclarator",
  "MemberExpression",
]);

export function addHooksDeps({ types: t }: { types: typeof types }): {
  visitor: Visitor;
} {
  return {
    visitor: {
      CallExpression: function (path) {
        const callee = (path.node.callee as unknown as types.Identifier).name;

        if (isRelevantCallee(path)) {
          // If the number of arguments is greater than 1, it means a deps array was manually added.
          // We don't want to override it.
          if (hookHasDeps(path)) {
            return;
          }

          const names = new Set<string>();
          const variablesInitializedInScope = new Set<string>();

          const scopeBindings = new Set(Object.keys(path.scope.bindings));

          path.traverse(hookInvocationVisitor, {
            names,
            callee,
            variablesInitializedInScope,
            t,
          });

          const stringLiterals: Identifier[] = getStringLiteralsFromNames(
            names,
            scopeBindings,
            t
          );
          path.node.arguments.push(t.arrayExpression(stringLiterals));
          path.skip();
        }
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

const callExpressionVisitor: Visitor<{
  chainedMembers: string[];
  innerMostCallExpression: NodePath<types.CallExpression> | undefined;
}> = {
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
  variablesInitializedInScope: Set<string>;
  t: typeof types;
}> = {
  Identifier: function (
    path,
    { names, callee, variablesInitializedInScope, t }
  ) {
    // We skip certain parent types because in this visitor we only care about "pure" identifiers.
    if (disallowedIdentifierParents.has(path.parent.type)) {
      return;
    }

    // We never want to add a local variable to the deps array.
    if (variablesInitializedInScope.has(path.node.name)) {
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
  CallExpression: (path, { names, variablesInitializedInScope, t }) => {
    const state: {
      chainedMembers: string[];
      innerMostCallExpression: NodePath<types.CallExpression> | undefined;
    } = { chainedMembers: [], innerMostCallExpression: undefined };

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

      if (variablesInitializedInScope.has(chainedMembers[0])) {
        return;
      }

      names.add(chainedMembers.join("."));
    }
  },
  // We ignore variables that are declared inside the hook
  VariableDeclarator: (path, { variablesInitializedInScope, t }) => {
    if (t.isIdentifier(path.node.id)) {
      variablesInitializedInScope.add(path.node.id.name);
    }
  },
};

function getStringLiteralsFromNames(
  names: Set<string>,
  scopeBindings: Set<string>,
  t: typeof types
) {
  const stringLiterals: Identifier[] = [];
  for (const name of names) {
    // Get first identifier (before first ".") to make sure it is declared in the component scope.
    const match = name.match(/[^.]+/);
    if (match?.[0] && scopeBindings.has(match?.[0])) {
      stringLiterals.push(t.identifier(name));
    }
  }
  return stringLiterals;
}

function isRelevantCallee(path: NodePath<types.CallExpression>): boolean {
  const callee = (path.node.callee as unknown as types.Identifier).name;
  return relevantCallees.has(callee);
}

function hookHasDeps(path: NodePath<types.CallExpression>): boolean {
  return path.node.arguments.length > 1;
}
