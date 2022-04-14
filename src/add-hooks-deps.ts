import parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

import { StringLiteral } from "@babel/types";

const relevantCallees = new Set(["useMemo"]);
const disallowedIdentifierParents = new Set([
  "VariableDeclarator",
  "MemberExpression",
]);
const disallowedMemberExpressionParents = new Set([
  "MemberExpression",
  "CallExpression",
]);

export function addHooksDeps(code: string) {
  const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    CallExpression: function (path) {
      const callee = (path.node.callee as unknown as t.Identifier).name;

      // If the number of arguments is greater than 1, it means a deps array was manually added.
      // We don't want to override it.
      if (path.node.arguments.length > 1) {
        return;
      }

      if (relevantCallees.has(callee)) {
        const names = new Set<string>();

        traverse(
          path.node,
          {
            Identifier: function (path2) {
              if (disallowedIdentifierParents.has(path2.parent.type)) {
                return;
              }

              if (t.isIdentifier(path2.node) && path2.node.name !== callee) {
                names.add(path2.node.name);
              }
            },
            MemberExpression: function (path2) {
              // We don't need to traverse a "MemberExpression" nested inside another "MemberExpression" or a "CallExpression"
              if (disallowedMemberExpressionParents.has(path2.parent.type)) {
                return;
              }

              const chainedMembers: string[] = [];
              let continueTraversal = true;

              traverse(
                path2.node,
                {
                  Identifier: function (path3) {
                    if (continueTraversal) {
                      chainedMembers.push(path3.node.name);
                    }
                  },
                  CallExpression: function () {
                    continueTraversal = false;
                  },
                },
                path2.scope,
                path2
              );
              if (chainedMembers.length) {
                if (path2.parent.type === "CallExpression") {
                  chainedMembers.pop();
                }
                names.add(chainedMembers.join("."));
              }
            },
          },
          path.scope,
          path
        );

        const stringLiterals: StringLiteral[] = [];
        for (const name of names) {
          stringLiterals.push(t.stringLiteral(name));
        }
        path.node.arguments.push(t.arrayExpression(stringLiterals));
        path.skip();
      }
    },
  });

  return generate(ast, {}, code).code;
}
