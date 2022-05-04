import { NodePath, TraverseOptions, VisitNode, Visitor } from "@babel/traverse";
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
        if (relevantCallees.has(callee)) {
          // If the number of arguments is greater than 1, it means a deps array was manually added.
          // We don't want to override it.
          if (path.node.arguments.length > 1) {
            return;
          }

          const names = new Set<string>();
          const variablesInitializedInScope = new Set<string>();

          const scopeBindings = new Set(Object.keys(path.scope.bindings));

          path.traverse(
            {
              Identifier: function (path2) {
                // We skip certain parent types because in this visitor we only care about "pure" identifiers.
                if (disallowedIdentifierParents.has(path2.parent.type)) {
                  return;
                }

                // We never want to add a local variable to the deps array.
                if (variablesInitializedInScope.has(path2.node.name)) {
                  return;
                }

                if (t.isIdentifier(path2.node) && path2.node.name !== callee) {
                  names.add(path2.node.name);
                }
              },
              MemberExpression: extractMemberExpression,
              CallExpression: (path2) => {
                let chainedMembers: string[] = [];
                let innerMostCallExpression: NodePath<types.CallExpression>;

                path2.traverse({
                  Identifier: function (path3) {
                    // When we are not dealing with nested calls we should chain the identifiers found
                    chainedMembers.push(path3.node.name);
                  },
                  CallExpression: function (path3) {
                    // We store the inner most Call Expression so we can traverse it later
                    innerMostCallExpression = path3;
                  },
                });

                // If we have found an inner Call Expression, we traverse it to find all identifiers.
                if (t.isCallExpression(innerMostCallExpression!)) {
                  chainedMembers = [];
                  innerMostCallExpression.traverse({
                    Identifier: function (path3) {
                      chainedMembers.push(path3.node.name);
                    },
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
              VariableDeclarator: (path) => {
                if (t.isIdentifier(path.node.id)) {
                  variablesInitializedInScope.add(path.node.id.name);
                }
              },
            },
            { names }
          );

          const stringLiterals: Identifier[] = [];
          for (const name of names) {
            // Get first identifier (before first ".") to make sure it is declared in the component scope.
            const match = name.match(/[^.]+/);
            if (match?.[0] && scopeBindings.has(match?.[0])) {
              stringLiterals.push(t.identifier(name));
            }
          }
          path.node.arguments.push(t.arrayExpression(stringLiterals));
          path.skip();
        }
      },
    },
  };
}

const extractMemberExpression: VisitNode<
  { names: Set<string> },
  types.MemberExpression
> = (path, { names }) => {
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

  const chainedMembers: string[] = [];
  let continueTraversal = true;
  path.traverse(memberExpressionInnerVisitor, {
    chainedMembers,
    continueTraversal,
  });

  if (chainedMembers.length) {
    names.add(chainedMembers.join("."));
  }
};

const memberExpressionInnerVisitor: TraverseOptions<{
  continueTraversal: boolean;
  chainedMembers: string[];
}> = {
  Identifier: function (path3) {
    if (this.continueTraversal) {
      this.chainedMembers.push(path3.node.name);
    }
  },
  CallExpression: function () {
    this.continueTraversal = false;
  },
};
